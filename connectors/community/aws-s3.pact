pact v1

-- Connector: AWS S3 object storage
@C connector.aws-s3 1.0.0
  domain connectors.storage
  author connector:community
  tags storage aws s3 cloud

@I
  natural "Connector for AWS S3 object storage"
  goal connector.operational

@S aws-s3
  base_url "https://{bucket}.s3.{region}.amazonaws.com"
  auth
    type api_key
    env AWS_ACCESS_KEY_ID
  retry_on 429 500 502 503

  operations
    put_object
      method PUT
      path "/{key}"
      intent "Upload an object to an S3 bucket"
      input
        bucket str !
        key str !
        body str !
        content_type str =application/octet-stream
        acl str ?
      output
        etag str
        version_id str
      errors
        no_such_bucket
          action abort "Bucket does not exist"
        access_denied
          action abort "Access denied to bucket"

    get_object
      method GET
      path "/{key}"
      intent "Download an object from an S3 bucket"
      input
        bucket str !
        key str !
        version_id str ?
      output
        body str
        content_type str
        content_length int
        etag str
      errors
        no_such_key
          action abort "Object key not found"
        access_denied
          action abort "Access denied"

    list_objects
      method GET
      path "/"
      intent "List objects in an S3 bucket"
      input
        bucket str !
        prefix str ?
        max_keys int =1000
        continuation_token str ?
      output
        contents list
        is_truncated bool
        next_continuation_token str
      errors
        no_such_bucket
          action abort "Bucket does not exist"

    delete_object
      method DELETE
      path "/{key}"
      intent "Delete an object from an S3 bucket"
      input
        bucket str !
        key str !
        version_id str ?
      output
        deleted bool
      errors
        no_such_key
          action abort "Object key not found"
