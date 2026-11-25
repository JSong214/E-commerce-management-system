# SJH-DATA 后端

需要 Python 3.11+ 和 MySQL 8.0。以下命令从 `backend/` 目录执行。

## 安装并启动

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

使用本机 MySQL 时，先创建 `sjh_data` 数据库和一个对该库有迁移及读写权限的账号。也可由 Docker Compose 创建数据库和账号。

先在 `backend/.env` 中配置数据库账号和密码（仓库提供 [`.env.example`](.env.example) 作为模板，`.env` 已被 `.gitignore` 忽略，填写一次即可长期复用，无需每次重新输入）：

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_DATABASE=sjh_data
MYSQL_USER=sjh
MYSQL_PASSWORD=你的应用账号密码
MYSQL_ROOT_PASSWORD=你的root密码
```

如果使用 Docker Compose（默认监听本机 `3307` 端口），直接启动即可自动读取 `backend/.env`：

```powershell
docker compose up -d --wait
```

使用现有本机 MySQL 时，只需在 `backend/.env` 中修改 `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD`（或直接填写 `DATABASE_URL`）。随后执行迁移、初始化种子数据并启动服务（程序会自动加载 `backend/.env`，若当前终端显式设置了 `DATABASE_URL` 等环境变量，则终端变量优先生效）：

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

`GET http://localhost:8000/api/v1/health` 返回进程状态。OpenAPI 文档位于 `http://localhost:8000/docs`。种子命令保留已有模板和状态映射的编辑。

## 导入、批次与报表

- 上传后按工作表暂存已脱敏数据。可用 `STAGING_DIR` 指定目录，默认是 `backend/storage/staging/`。验证错误里的行号从表头之后的第一行开始计算，空白行仍占用原始行号。
- GBK CSV 的编码识别结果为 `gb18030`，Excel 的结果为 `binary`。淘宝和天猫的表头指纹相同，预览同分时推荐淘宝模板，验证时可按数据来源选用天猫模板。
- 提交成功后清理暂存数据，错误表可从批次历史下载。批次号使用验证日期和验证标识，同一验证请求重试时返回同一个已提交批次。
- 日期筛选包含起始日和结束日。带时区的时间转换为 UTC+08:00。报表的周标签为周一，月标签为当月第一天。
- 订单明细和报表导出覆盖选中筛选条件下的全部记录。报表类型可选 `summary` 或 `sku_ranking`，附带工作表 `标准化明细` 时包含参与计算的订单行。

## 测试

为测试提供独立的 MySQL 8.0 实例，并在 `backend/.env` 中配置 `TEST_MYSQL_HOST` / `TEST_MYSQL_PORT` / `TEST_MYSQL_USER` / `TEST_MYSQL_PASSWORD`（或直接设置 `TEST_DATABASE_URL`）。账号需要创建和删除临时 `sjh_test_*` 数据库的权限。每个集成测试创建并删除自己的数据库。未配置测试库变量时，只运行无需数据库的测试。

```powershell
.\.venv\Scripts\python.exe -m pytest
```
