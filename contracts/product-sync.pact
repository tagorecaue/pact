pact v1

@C product.sync 1.0.0
  domain demo.products
  author pact:cli
  created 2026-03-15T00:00:00Z
  tags demo self-healing

@T
  http POST /api/sync-products

@I
  natural "Fetch products from external API and sync to local store"
  goal products.synced
  timeout 30s

@E
  product
    id id !
    name str !
    price int !
    in_stock bool !

@X
  <> localhost:4000/api/products
    send
    receive id name price in_stock
  persist product
  emit products.synced
