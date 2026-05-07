/**
 * Run with: npx tsx src/data/generate.ts
 * Outputs: src/data/papers.json (updated clusters.json counts)
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const TOTAL = 8000;

const clusterDefs = [
  {
    id: 0, name: '教育心理学·认知发展', color: '#ff6b6b',
    center: [15, 20, 10] as [number, number, number],
    titlePrefixes: ['基于认知负荷理论的', '学习动机与', '元认知策略在', '自我调节学习的', '认知发展视角下的'],
    titleSuffixes: ['教学设计研究', '学业成就影响分析', '实证研究', '理论框架构建', '实验研究'],
    keywords: ['认知负荷', '学习动机', '元认知', '自我效能感', '学习策略', '认知发展', '心理韧性', '学业情绪'],
    journals: ['心理学报', '教育研究', '心理发展与教育', '教育学报', '华东师范大学学报(教育科学版)'],
    institutions: ['北京师范大学心理学部', '华东师范大学心理与认知科学学院', '西南大学心理学部', '华南师范大学心理学院', '东北师范大学心理学院'],
  },
  {
    id: 1, name: '课程改革·教学方法', color: '#4ecdc4',
    center: [-20, 5, -15] as [number, number, number],
    titlePrefixes: ['新课程改革背景下', '翻转课堂在', '项目式学习在', '核心素养导向的', '混合式教学模式在'],
    titleSuffixes: ['的教学实践研究', '的应用效果分析', '中的教学改革探索', '的课程设计研究', '的实施策略研究'],
    keywords: ['课程改革', '翻转课堂', '项目式学习', '核心素养', '混合式教学', '教学设计', '学科融合', 'STEM教育'],
    journals: ['课程·教材·教法', '教育研究', '中国教育学刊', '教育发展研究', '全球教育展望'],
    institutions: ['华东师范大学课程与教学研究所', '北京师范大学教育学部', '南京师范大学教育科学学院', '华中师范大学教育学院', '首都师范大学教育学院'],
  },
  {
    id: 2, name: '高等教育·人才培养', color: '#45b7d1',
    center: [5, -25, 20] as [number, number, number],
    titlePrefixes: ['双一流建设背景下', '研究生教育中', '创新创业教育在', '产教融合视角下', '高校'],
    titleSuffixes: ['人才培养模式研究', '的质量保障体系构建', '的现状与对策', '的改革路径探析', '的实践与反思'],
    keywords: ['双一流', '研究生教育', '创新创业', '产教融合', '人才培养', '学科建设', '教育质量', '高等教育'],
    journals: ['高等教育研究', '中国高教研究', '学位与研究生教育', '高等工程教育研究', '江苏高教'],
    institutions: ['北京大学教育学院', '清华大学教育研究院', '浙江大学教育学院', '厦门大学教育研究院', '武汉大学教育科学研究院'],
  },
  {
    id: 3, name: '教育信息化·技术应用', color: '#f7dc6f',
    center: [-10, -15, -25] as [number, number, number],
    titlePrefixes: ['人工智能赋能', '大数据驱动的', '虚拟现实技术在', '智慧教育环境下', '教育数字化转型中'],
    titleSuffixes: ['教育应用研究', '的学习分析框架', '教学效果实证研究', '的创新实践', '的技术路径探索'],
    keywords: ['人工智能', '大数据', '虚拟现实', '智慧教育', '在线学习', '教育信息化', '学习分析', 'MOOC'],
    journals: ['电化教育研究', '中国电化教育', '远程教育杂志', '开放教育研究', '现代教育技术'],
    institutions: ['华中师范大学国家数字化学习工程技术研究中心', '北京师范大学智慧学习研究院', '华东师范大学教育信息技术学系', '西北师范大学教育技术学院', '江南大学教育信息化研究中心'],
  },
  {
    id: 4, name: '学前教育·儿童发展', color: '#bb8fce',
    center: [25, 10, -5] as [number, number, number],
    titlePrefixes: ['幼儿园', '学前儿童', '游戏化教学在', '家园共育视角下', '早期阅读对'],
    titleSuffixes: ['教育质量评估研究', '社会性发展的影响', '幼儿教育中的应用', '的实践探索', '儿童语言发展的影响研究'],
    keywords: ['学前教育', '幼儿发展', '游戏化教学', '家园共育', '早期阅读', '幼儿园课程', '儿童社会性', '保教质量'],
    journals: ['学前教育研究', '幼儿教育', '早期教育', '教育导刊(下半月)', '学前教育'],
    institutions: ['南京师范大学学前教育系', '华东师范大学学前教育学系', '北京师范大学学前教育研究所', '西南大学教育学部', '浙江师范大学杭州幼儿师范学院'],
  },
  {
    id: 5, name: '教育公平·政策研究', color: '#f1948a',
    center: [-25, 20, 15] as [number, number, number],
    titlePrefixes: ['城乡教育均衡发展', '义务教育阶段', '教育扶贫政策的', '流动儿童', '"双减"政策下'],
    titleSuffixes: ['的政策分析', '资源配置公平性研究', '实施效果评估', '教育权利保障研究', '的影响与对策研究'],
    keywords: ['教育公平', '城乡教育', '教育政策', '教育扶贫', '流动儿童', '双减', '均衡发展', '教育财政'],
    journals: ['教育研究', '北京大学教育评论', '教育与经济', '教育发展研究', '中国教育政策评论'],
    institutions: ['北京大学中国教育财政科学研究所', '华中师范大学教育学院', '东北师范大学教育学部', '中国人民大学教育学院', '北京师范大学中国教育政策研究院'],
  },
  {
    id: 6, name: '教师教育·专业发展', color: '#82e0aa',
    center: [10, -10, -20] as [number, number, number],
    titlePrefixes: ['新手教师', '教师专业学习共同体', 'TPACK框架下', '乡村教师', '教师情感劳动与'],
    titleSuffixes: ['专业成长路径研究', '的构建与实践', '教师信息素养提升研究', '职业认同研究', '职业幸福感研究'],
    keywords: ['教师专业发展', '教师教育', 'TPACK', '教师培训', '职业认同', '教师素养', '反思性教学', '教师评价'],
    journals: ['教师教育研究', '教育研究', '教育发展研究', '全球教育展望', '教育科学'],
    institutions: ['北京师范大学教师教育研究中心', '华东师范大学教师教育学院', '陕西师范大学教育学部', '东北师范大学教育学部', '湖南师范大学教育科学学院'],
  },
  {
    id: 7, name: '比较教育·国际视野', color: '#f0b27a',
    center: [-15, -20, 25] as [number, number, number],
    titlePrefixes: ['芬兰基础教育', '日本', '美国STEM教育', '国际比较视角下', '德国双元制'],
    titleSuffixes: ['的经验与启示', '教育改革的最新动向', '对我国的借鉴意义', '的比较研究', '的本土化实践研究'],
    keywords: ['比较教育', '国际教育', 'PISA', '教育全球化', '跨文化教育', '教育借鉴', '国际组织', '教育交流'],
    journals: ['比较教育研究', '外国教育研究', '全球教育展望', '世界教育信息', '教育研究'],
    institutions: ['北京师范大学国际与比较教育研究院', '华东师范大学国际与比较教育研究所', '浙江大学教育学院', '西南大学教育学部', '华南师范大学国际与比较教育研究所'],
  },
];

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateAbstract(cluster: typeof clusterDefs[0]): string {
  const sentences = [
    `本研究以${pickRandom(cluster.keywords)}为切入点，探讨了${pickRandom(cluster.keywords)}在当代教育中的重要作用。`,
    `通过文献分析与实证调查，研究发现${pickRandom(cluster.keywords)}与${pickRandom(cluster.keywords)}之间存在显著相关性。`,
    `研究采用混合方法设计，结合问卷调查（N=${Math.floor(Math.random() * 500 + 200)}）和深度访谈，系统分析了相关因素。`,
    `结果表明，${pickRandom(cluster.keywords)}对教育质量的提升具有积极影响，尤其在${pickRandom(cluster.keywords)}方面表现突出。`,
    `本文为${cluster.name.split('·')[0]}领域的研究提供了新的理论视角和实践参考。`,
  ];
  return sentences.join('');
}

function generatePapers() {
  const papers: Array<{
    id: string; title: string; authors: string[]; institution: string;
    journal: string; year: number; keywords: string[]; abstract: string;
    clusterId: number; embedding: [number, number, number];
  }> = [];

  const lastNames = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '胡', '朱', '郭', '何', '罗', '高', '林'];
  const firstNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '华', '建'];

  const clusterCounts = new Array(8).fill(0);

  for (let i = 0; i < TOTAL; i++) {
    const cluster = clusterDefs[i % clusterDefs.length];
    clusterCounts[cluster.id]++;

    const yearRandom = Math.pow(Math.random(), 1.5);
    const year = Math.floor(1990 + yearRandom * 35);

    const spread = 6;
    const embedding: [number, number, number] = [
      cluster.center[0] + gaussianRandom() * spread,
      cluster.center[1] + gaussianRandom() * spread,
      cluster.center[2] + gaussianRandom() * spread,
    ];

    const numAuthors = Math.floor(Math.random() * 3) + 1;
    const authors = Array.from({ length: numAuthors }, () =>
      pickRandom(lastNames) + pickRandom(firstNames)
    );

    const numKeywords = Math.floor(Math.random() * 3) + 3;
    const kwSet = new Set<string>();
    while (kwSet.size < numKeywords) kwSet.add(pickRandom(cluster.keywords));

    papers.push({
      id: `paper-${String(i).padStart(5, '0')}`,
      title: pickRandom(cluster.titlePrefixes) + pickRandom(cluster.titleSuffixes),
      authors,
      institution: pickRandom(cluster.institutions),
      journal: pickRandom(cluster.journals),
      year,
      keywords: [...kwSet],
      abstract: generateAbstract(cluster),
      clusterId: cluster.id,
      embedding,
    });
  }

  const clusters = clusterDefs.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    count: clusterCounts[c.id],
  }));

  const dir = import.meta.dirname;
  writeFileSync(join(dir, 'papers.json'), JSON.stringify(papers));
  writeFileSync(join(dir, 'clusters.json'), JSON.stringify(clusters, null, 2));
  console.log(`Generated ${papers.length} papers across ${clusters.length} clusters`);
  clusters.forEach(c => console.log(`  ${c.name}: ${c.count}`));
}

generatePapers();
