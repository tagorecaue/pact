pact v1

-- Connector: Cloudflare R2 object storage
@C connector.cloudflare-r2 1.0.0
  domain connectors.storage
  author connector:community
  tags storage cloudflare r2 s3-compatible

@I
  natural "Connector for Cloudflare R2 object storage"
  goal connector.operational

@S cloudflare-r2
  base_url "https://{account_id}.r2.cloudflarestorage.com"
  auth
    type api_key
    env CLOUDFLARE_R2_ACCESS_KEY
  retry_on 429 500 502 503

  operations
    put_object
      method PUT
      path "/{bucket}/{key}"
      intent "Upload an object to an R2 bucket"
      input
        bucket str !
        key str !
        body str !
        content_type str =application/octet-stream
      output
        etag str
        version_id str
      errors
        no_such_bucket
          action abort "Bucket does not exist"
        access_denied
          action abort "Access denied"

    get_object
      method GET
      path "/{bucket}/{key}"
      intent "Download an object from an R2 bucket"
      input
        bucket str !
        key str !
      output
        body str
        content_type str
        content_length int
        etag str
      errors
        no_such_key
          action abort "Object key not found"

    list_objects
      method GET
      path "/{bucket}"
      intent "List objects in an R2 bucket"
      input
        bucket str !
        prefix str ?
        max_keys int =1000
      output
        contents list
        is_truncated bool
      errors
        no_such_bucket
          action abort "Bucket does not exist"
