# test_oah_server_0416 适配说明（thinking 双路）

## 你能在这个目录里做的

这个目录是 **测试数据根**（模型配置、模板、workspace 数据），不是 OAH 服务端源码仓。

所以这里可做的是：

1. 增加/切换模型配置（`source/models/*.yaml`）
2. 修改默认模型（`server.docker.yaml`）
3. 同步到 MinIO 后验证前端调试台 `thinking_events`

## 已完成的适配

- 新增模型槽位：`source/models/doubao-reasoning.yaml`
- `server.docker.yaml` 加了切换注释（`default_model: doubao-reasoning`）

## 切换步骤

1. 编辑 `source/models/doubao-reasoning.yaml`
   - 把 `name` 改成网关里真实支持 reasoning 的模型名
2. 编辑 `server.docker.yaml`
   - `llm.default_model` 改成 `doubao-reasoning`
3. 在 OAH 主仓执行数据同步（与你现有流程一致）：
   - `pnpm storage:sync`
4. 重启服务并测试

## 关键限制（必须知道）

如果后端协议层只发单路文本（无 thinking lane），即使换 reasoning 模型，前端仍可能看到 `thinking_events=0`。

原因：协议/路由是否输出 `message.thinking.delta` 取决于 **OAH 服务端源码**，不在本目录内。

要实现真正原生双路，需要在 OAH 主服务仓修改：

- provider 适配层（提取 thinking/answer）
- run 事件总线
- SSE 路由事件（thinking/answer 分开）
