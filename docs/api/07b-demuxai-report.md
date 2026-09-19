# 07b · Demux 报表

## 页面信息

| 项 | 值 |
| --- | --- |
| 路由 | `/demux/report` |
| 角色 | **Admin** |
| 视图 | `src/features/demux/views/ConsumptionReportView.vue` |
| Port | `DemuxLogsPort.statConsumption` + `listProviderGroups` |

## 业务定义

时间范围内对**成功调用**做消耗查询。主界面是分页表格，不是排行图。

| 项 | 说明 |
| --- | --- |
| 粒度 | 默认 `按小时`；可改 `按天` / `合计`（无时间列） |
| 拆分 | `按渠道` / `按模型` 二选一，默认渠道 |
| 筛选 | 时间必填；渠道可多选，精确匹配 `vendorKey` |
| 口径 | 只计成功调用；Token 取 usage jsonb；扣费 = `totalQuota` |
| 表 | 按小时时一行 = 一小时 × 一个渠道（或模型）；分页 20/50/100 |
| 下钻 | 点渠道名 → 锁该渠道并改为按模型；点模型名 → 改回按渠道 |
| 渠道展示 | `vendorKey`（= `vendors.queue_group`） |

## 接口清单

| 业务动作 | Port 方法 | HTTP |
| --- | --- | --- |
| 灵活消耗报表 | `statConsumption(query)` | `GET /demux/api/admin/logs/stats/consumption` |
| 渠道下拉 | `listProviderGroups` | `GET /demux/api/admin/providers` |

### `GET /demux/api/admin/logs/stats/consumption`

| 参数 | 说明 |
| --- | --- |
| `fromUtc` `toUtc` | Unix 毫秒，必填 |
| `timeBucket` | `hour`（默认）/ `day` / `none` |
| `breakdown` | `vendor`（默认）/ `model` |
| `vendorKeys` | 逗号分隔，精确；空 = 全部 |
| `modelNames` | 逗号分隔，精确匹配 `routeKey`；本页默认不传 |

`timeBucket=none` 时 `bucketSeconds=0`、`bucketStartUtc=0`。后端按组最多 200 个，再拉这些组的时间序列。前端 `totalCost` ← `totalQuota`。
