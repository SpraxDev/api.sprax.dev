CREATE FUNCTION skin_random_endpoint_bucket(text) RETURNS int
    LANGUAGE sql
    IMMUTABLE PARALLEL SAFE STRICT AS
$$
SELECT ('x' || md5($1))::bit(32)::int
$$;

CREATE FUNCTION skin_random_endpoint_get_one()
    RETURNS SETOF skin_urls
    LANGUAGE sql VOLATILE AS $$
WITH t AS MATERIALIZED (
    SELECT ((random() * 4294967295)::bigint - 2147483648)::int AS target
)
SELECT * FROM (
                  (SELECT * FROM skin_urls
                   WHERE skin_random_endpoint_bucket(url) >= (SELECT target FROM t)
                     AND texture_signature IS NOT NULL
                   ORDER BY skin_random_endpoint_bucket(url) LIMIT 1)
                  UNION ALL
                  (SELECT * FROM skin_urls
                   WHERE skin_random_endpoint_bucket(url) < (SELECT target FROM t)
                     AND texture_signature IS NOT NULL
                   ORDER BY skin_random_endpoint_bucket(url) DESC LIMIT 1)
              ) s
LIMIT 1;
$$;

CREATE INDEX skin_random_endpoint_url_bucket_idx
    ON skin_urls (skin_random_endpoint_bucket(url))
    WHERE texture_signature IS NOT NULL;
