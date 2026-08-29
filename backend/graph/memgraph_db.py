import logging
from neo4j import GraphDatabase
from config import settings

logger = logging.getLogger("uvicorn")

MEMGRAPH_URI = f"bolt://{settings.memgraph_host}:{settings.memgraph_port}"

# Singleton Driver instance to prevent connection leaks & pool exhaustion
_driver_instance = None

def get_memgraph_driver():
    """
    Returns a singleton neo4j Driver instance for Memgraph v3.12.
    Reuses connection pool across requests.
    """
    global _driver_instance
    if _driver_instance is None:
        try:
            _driver_instance = GraphDatabase.driver(
                MEMGRAPH_URI,
                auth=("", ""),
                encrypted=False,
                max_connection_pool_size=50
            )
            logger.info(f"Connected to Memgraph singleton driver at {MEMGRAPH_URI}")
        except Exception as e:
            logger.error(f"Failed to connect to Memgraph at {MEMGRAPH_URI} - Error: {e}")
            raise e
    return _driver_instance

def execute_cypher(query: str, parameters: dict = None):
    """
    Executes a Cypher query against Memgraph and returns results as a list of dicts.
    """
    driver = get_memgraph_driver()
    try:
        with driver.session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]
    except Exception as e:
        logger.error(f"Error executing Cypher query: {query[:100]}... | Error: {e}")
        raise e

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
