/**
 * Generate visualization data from real paper database.
 * Run with: npx tsx src/data/generate-from-db.ts
 *
 * Strategy:
 * 1. Map showclasstypes to 10 education clusters
 * 2. Sample ~8000 papers proportionally
 * 3. Generate 3D coordinates: cluster center + keyword-based offset + gaussian noise
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(import.meta.dirname, '../../data/merged.db3');
const TOTAL_SAMPLE = 8000;

// Define clusters based on actual showclasstypes distribution
const clusterConfig = [
  {
    id: 0,
    name: '高等教育·人才培养',
    color: '#45b7d1',
    pattern: '%高等教育%',
    center: [18, -12, 8] as [number, number, number],
  },
  {
    id: 1,
    name: '教育学原理·教育技术',
    color: '#4ecdc4',
    pattern: '%教育学原理%',
    center: [-15, 20, -10] as [number, number, number],
  },
  {
    id: 2,
    name: '课程与教学论',
    color: '#ff6b6b',
    pattern: '%课程与教学%',
    center: [5, 8, 22] as [number, number, number],
  },
  {
    id: 3,
    name: '职业技术教育',
    color: '#f7dc6f',
    pattern: '%职业技术教育%',
    center: [-22, -8, 15] as [number, number, number],
  },
  {
    id: 4,
    name: '教育信息化·教育技术',
    color: '#bb8fce',
    pattern: '%教育技术%',
    center: [12, 18, -20] as [number, number, number],
  },
  {
    id: 5,
    name: '学前教育·儿童发展',
    color: '#f0b27a',
    pattern: '%学前教育%',
    center: [-10, -22, -5] as [number, number, number],
  },
  {
    id: 6,
    name: '特殊教育·心理学',
    color: '#f1948a',
    pattern: '%特殊教育%',
    center: [20, 5, -15] as [number, number, number],
  },
  {
    id: 7,
    name: '成人教育·继续教育',
    color: '#82e0aa',
    pattern: '%成人教育%',
    center: [-18, 15, 18] as [number, number, number],
  },
  {
    id: 8,
    name: '教育心理·发展心理',
    color: '#85c1e9',
    pattern: '%心理%',
    center: [8, -20, -18] as [number, number, number],
  },
  {
    id: 9,
    name: '基础教育·教育学',
    color: '#d7bde2',
    pattern: '%教育学;%',
    center: [-5, -5, 5] as [number, number, number],
  },
];

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Simple string hash for deterministic keyword-based offsets
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Use keyword hash to create sub-cluster positioning
function keywordOffset(keywords: string): [number, number, number] {
  const parts = keywords.split(';').filter(Boolean);
  if (parts.length === 0) return [0, 0, 0];

  let x = 0, y = 0, z = 0;
  for (const kw of parts) {
    const h = hashStr(kw.trim());
    x += ((h & 0xff) - 128) / 128;
    y += (((h >> 8) & 0xff) - 128) / 128;
    z += (((h >> 16) & 0xff) - 128) / 128;
  }
  const n = parts.length;
  return [x / n * 3, y / n * 3, z / n * 3];
}

interface RawPaper {
  lngid: string;
  title_c: string;
  title_e: string;
  keyword_c: string;
  keyword_e: string;
  remark_c: string;
  years: string;
  publishdate: string;
  firstwriter: string;
  showwriter: string;
  firstorgan: string;
  showorgan: string;
  media_c: string;
  showclasstypes: string;
  core_journal: string;
}

function main() {
  const db = new Database(DB_PATH, { readonly: true });

  // Classify papers into clusters by priority (first match wins)
  // Query each cluster separately, then deduplicate
  const papersByCluster: Map<number, RawPaper[]> = new Map();
  const seenIds = new Set<string>();

  for (const cluster of clusterConfig) {
    const rows = db.prepare(`
      SELECT lngid, title_c, title_e, keyword_c, keyword_e, remark_c,
             years, publishdate, firstwriter, showwriter, firstorgan, showorgan,
             media_c, showclasstypes, core_journal
      FROM main0
      WHERE showclasstypes LIKE ?
        AND title_c != '' AND title_c IS NOT NULL
        AND keyword_c != '' AND keyword_c IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 3000
    `).all(cluster.pattern) as RawPaper[];

    const unique = rows.filter(r => {
      if (seenIds.has(r.lngid)) return false;
      seenIds.add(r.lngid);
      return true;
    });

    papersByCluster.set(cluster.id, unique);
    console.log(`  Cluster ${cluster.id} (${cluster.name}): ${unique.length} candidates`);
  }

  // Calculate proportional sampling
  const totalCandidates = Array.from(papersByCluster.values()).reduce((s, a) => s + a.length, 0);
  console.log(`\nTotal candidates: ${totalCandidates}`);

  const papers: Array<{
    id: string; title: string; titleEn: string; authors: string[];
    institution: string; journal: string; year: number;
    keywords: string[]; keywordsEn: string[]; abstract: string;
    clusterId: number; embedding: [number, number, number];
    coreJournal: boolean;
  }> = [];

  const clusterCounts: number[] = new Array(clusterConfig.length).fill(0);

  for (const cluster of clusterConfig) {
    const candidates = papersByCluster.get(cluster.id) || [];
    const sampleSize = Math.max(
      200,
      Math.round((candidates.length / totalCandidates) * TOTAL_SAMPLE)
    );
    const sampled = candidates.slice(0, sampleSize);

    for (const raw of sampled) {
      const kwOffset = keywordOffset(raw.keyword_c);
      const spread = 5;
      const embedding: [number, number, number] = [
        cluster.center[0] + kwOffset[0] + gaussianRandom() * spread,
        cluster.center[1] + kwOffset[1] + gaussianRandom() * spread,
        cluster.center[2] + kwOffset[2] + gaussianRandom() * spread,
      ];

      const year = parseInt(raw.years) || parseInt(raw.publishdate?.slice(0, 4)) || 2020;

      // Parse authors: "张三[1];李四[2]" -> ["张三", "李四"]
      const authors = (raw.showwriter || raw.firstwriter || '')
        .split(';')
        .map(a => a.replace(/\[.*?\]/g, '').trim())
        .filter(Boolean);

      // Parse institution: take first one
      const institution = (raw.firstorgan || raw.showorgan || '')
        .replace(/\[.*?\]/g, '')
        .split(';')[0]
        .trim();

      const keywords = (raw.keyword_c || '').split(';').map(k => k.trim()).filter(Boolean);
      const keywordsEn = (raw.keyword_e || '').split(';').map(k => k.trim()).filter(Boolean);

      papers.push({
        id: raw.lngid,
        title: raw.title_c,
        titleEn: raw.title_e || '',
        authors,
        institution,
        journal: raw.media_c || '',
        year,
        keywords,
        keywordsEn,
        abstract: raw.remark_c || '',
        clusterId: cluster.id,
        embedding,
        coreJournal: (raw.core_journal || '') !== '',
      });

      clusterCounts[cluster.id]++;
    }
  }

  db.close();

  // Build clusters output
  const clusters = clusterConfig.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    count: clusterCounts[c.id],
  }));

  const dir = import.meta.dirname;
  writeFileSync(join(dir, 'papers.json'), JSON.stringify(papers));
  writeFileSync(join(dir, 'clusters.json'), JSON.stringify(clusters, null, 2));

  console.log(`\nGenerated ${papers.length} papers across ${clusters.length} clusters:`);
  clusters.forEach(c => console.log(`  ${c.name}: ${c.count}`));
  console.log(`\nYear range: ${Math.min(...papers.map(p => p.year))} - ${Math.max(...papers.map(p => p.year))}`);
}

main();
