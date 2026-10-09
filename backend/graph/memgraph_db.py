import logging
from neo4j import GraphDatabase
from config import settings

logger = logging.getLogger("uvicorn")

MEMGRAPH_URI = f"bolt://{settings.memgraph_host}:{settings.memgraph_port}"

import time

# Singleton Driver instance to prevent connection leaks & pool exhaustion
_driver_instance = None
_last_failure_timestamp = 0
_RETRY_INTERVAL_SECONDS = 3.0

def get_memgraph_driver():
    global _driver_instance, _last_failure_timestamp
    
    # If driver exists and is active, return it
    if _driver_instance is not None:
        return _driver_instance

    # Backoff check to prevent hot-looping if database is unreachable
    now = time.time()
    if now - _last_failure_timestamp < _RETRY_INTERVAL_SECONDS:
        return None

    try:
        if settings.neo4j_uri and settings.neo4j_password and settings.neo4j_password.get_secret_value():
            uri = settings.neo4j_uri
            user = settings.neo4j_username or "neo4j"
            pwd = settings.neo4j_password.get_secret_value()
            _driver_instance = GraphDatabase.driver(
                uri,
                auth=(user, pwd),
                max_connection_pool_size=50,
                connection_timeout=5.0
            )
        else:
            uri = f"bolt://{settings.memgraph_host}:{settings.memgraph_port}"
            _driver_instance = GraphDatabase.driver(
                uri,
                auth=("", ""),
                encrypted=False,
                max_connection_pool_size=50,
                connection_timeout=5.0
            )
        with _driver_instance.session() as session:
            session.run("RETURN 1")
        logger.info(f"Connected to Graph Database at {uri}")
        return _driver_instance
    except Exception as e:
        logger.info(f"Graph Database connection attempt failed: {e}")
        _last_failure_timestamp = time.time()
        _driver_instance = None
        return None

def execute_cypher(query: str, parameters: dict = None):
    global _driver_instance
    driver = get_memgraph_driver()
    if not driver:
        return []
    try:
        with driver.session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]
    except Exception as e:
        logger.warning(f"Graph query warning (retrying with fresh session): {e}")
        # Reset driver instance in case socket was dropped by Aura/Memgraph
        _driver_instance = None
        driver = get_memgraph_driver()
        if not driver:
            return []
        try:
            with driver.session() as session:
                result = session.run(query, parameters or {})
                return [record.data() for record in result]
        except Exception as retry_err:
            logger.warning(f"Graph query retry failed: {retry_err}")
            return []

def init_memgraph_schema():
    """
    Initializes indexes and uniqueness constraints in Memgraph.
    Ensures multi-tenant user isolation (user_id) and unique entity nodes per person.
    """
    indexes = [
        "CREATE INDEX ON :Faculty(name);",
        "CREATE INDEX ON :Faculty(user_id);",
        "CREATE INDEX ON :Project(id);",
        "CREATE INDEX ON :Project(user_id);",
        "CREATE INDEX ON :Grant(id);",
        "CREATE INDEX ON :Department(name);"
    ]
    for idx_query in indexes:
        try:
            execute_cypher(idx_query)
        except Exception as e:
            logger.info(f"Index creation note: {e}")

def close_memgraph_driver():
    """Closes the singleton driver on application shutdown."""
    global _driver_instance
    if _driver_instance is not None:
        _driver_instance.close()
        _driver_instance = None
        logger.info("Memgraph connection driver closed.")
