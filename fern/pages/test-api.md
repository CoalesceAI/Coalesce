# Test API Reference

## POST /test/endpoint

Creates a test resource.

**Parameters:**
- `name` (string, required): The resource name.

**Example:**

```http
POST /test/endpoint
Content-Type: application/json

{ "name": "my-resource" }
```

**Response:**

```json
{ "id": "res_123", "name": "my-resource", "created": true }
```
