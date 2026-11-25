from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from app.env import get_database_url


def run_migrations():
    url = context.config.attributes.get("database_url") or get_database_url()
    if not url:
        raise RuntimeError(
            "请配置 DATABASE_URL 或在 backend/.env 中设置 MYSQL_USER 和 MYSQL_PASSWORD"
        )
    if context.is_offline_mode():
        context.configure(url=url, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
        return

    engine = create_engine(url, poolclass=NullPool, hide_parameters=True)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


run_migrations()
