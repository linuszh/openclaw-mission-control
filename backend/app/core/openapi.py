"""OpenAPI documentation and example generation logic for the Mission Control API."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi.openapi.utils import get_openapi

if TYPE_CHECKING:
    from fastapi import FastAPI

_JSON_SCHEMA_REF_PREFIX = "#/components/schemas/"
_OPENAPI_EXAMPLE_TAGS = {
    "agents",
    "activity",
    "gateways",
    "metrics",
    "organizations",
    "souls-directory",
    "skills",
    "board-groups",
    "board-group-memory",
    "boards",
    "board-memory",
    "board-webhooks",
    "board-onboarding",
    "approvals",
    "tasks",
    "custom-fields",
    "tags",
    "users",
}
_GENERIC_RESPONSE_DESCRIPTIONS = {"Successful Response", "Validation Error"}
_HTTP_RESPONSE_DESCRIPTIONS = {
    "200": "Request completed successfully.",
    "201": "Resource created successfully.",
    "202": "Request accepted for processing.",
    "204": "Request completed successfully with no response body.",
    "400": "Request validation failed.",
    "401": "Authentication is required or token is invalid.",
    "403": "Caller is authenticated but not authorized for this operation.",
    "404": "Requested resource was not found.",
    "409": "Request conflicts with the current resource state.",
    "422": "Request payload failed schema or field validation.",
    "429": "Request was rate-limited.",
    "500": "Internal server error.",
}
_METHOD_SUMMARY_PREFIX = {
    "get": "List",
    "post": "Create",
    "put": "Replace",
    "patch": "Update",
    "delete": "Delete",
}


def _resolve_schema_ref(
    schema: dict[str, Any],
    *,
    components: dict[str, Any],
    seen_refs: set[str] | None = None,
) -> dict[str, Any]:
    """Resolve local component refs for OpenAPI schema traversal."""
    ref = schema.get("$ref")
    if not isinstance(ref, str):
        return schema
    if not ref.startswith(_JSON_SCHEMA_REF_PREFIX):
        return schema
    if seen_refs is None:
        seen_refs = set()
    if ref in seen_refs:
        return schema
    seen_refs.add(ref)
    schema_name = ref[len(_JSON_SCHEMA_REF_PREFIX) :]
    schemas = components.get("schemas")
    if not isinstance(schemas, dict):
        return schema
    target = schemas.get(schema_name)
    if not isinstance(target, dict):
        return schema
    return _resolve_schema_ref(target, components=components, seen_refs=seen_refs)


def _example_from_schema(schema: dict[str, Any], *, components: dict[str, Any]) -> Any:
    """Generate an OpenAPI example from schema metadata with sensible fallbacks."""
    resolved = _resolve_schema_ref(schema, components=components)

    if "example" in resolved:
        return resolved["example"]
    examples = resolved.get("examples")
    if isinstance(examples, list) and examples:
        return examples[0]

    for composite_key in ("anyOf", "oneOf", "allOf"):
        composite = resolved.get(composite_key)
        if isinstance(composite, list):
            for branch in composite:
                if not isinstance(branch, dict):
                    continue
                branch_example = _example_from_schema(branch, components=components)
                if branch_example is not None:
                    return branch_example

    enum_values = resolved.get("enum")
    if isinstance(enum_values, list) and enum_values:
        return enum_values[0]

    schema_type = resolved.get("type")
    if schema_type == "object":
        output: dict[str, Any] = {}
        properties = resolved.get("properties")
        if isinstance(properties, dict):
            for key, property_schema in properties.items():
                if not isinstance(property_schema, dict):
                    continue
                property_example = _example_from_schema(property_schema, components=components)
                if property_example is not None:
                    output[key] = property_example
        if output:
            return output
        additional_properties = resolved.get("additionalProperties")
        if isinstance(additional_properties, dict):
            value_example = _example_from_schema(additional_properties, components=components)
            if value_example is not None:
                return {"key": value_example}
        return {}

    if schema_type == "array":
        items = resolved.get("items")
        if isinstance(items, dict):
            item_example = _example_from_schema(items, components=components)
            if item_example is not None:
                return [item_example]
        return []

    if schema_type == "string":
        return "string"
    if schema_type == "integer":
        return 0
    if schema_type == "number":
        return 0
    if schema_type == "boolean":
        return False

    return None


def _inject_json_content_example(
    *,
    content: dict[str, Any],
    components: dict[str, Any],
) -> None:
    """Attach an example to application/json content when one is missing."""
    app_json = content.get("application/json")
    if not isinstance(app_json, dict):
        return
    if "example" in app_json or "examples" in app_json:
        return
    schema = app_json.get("schema")
    if not isinstance(schema, dict):
        return
    generated_example = _example_from_schema(schema, components=components)
    if generated_example is not None:
        app_json["example"] = generated_example


def _build_operation_summary(*, method: str, path: str) -> str:
    """Build a readable summary when an operation does not define one."""
    prefix = _METHOD_SUMMARY_PREFIX.get(method.lower(), "Handle")
    path_without_prefix = path.removeprefix("/api/v1/")
    parts = [
        part.replace("-", " ")
        for part in path_without_prefix.split("/")
        if part and not (part.startswith("{") and part.endswith("}"))
    ]
    if not parts:
        return prefix
    return f"{prefix} {' '.join(parts)}".strip().title()


def _normalize_operation_docs(
    *,
    operation: dict[str, Any],
    method: str,
    path: str,
) -> None:
    """Normalize summary/description/responses/request-body docs for tagged operations."""
    summary = str(operation.get("summary", "")).strip()
    if not summary:
        summary = _build_operation_summary(method=method, path=path)
        operation["summary"] = summary

    description = str(operation.get("description", "")).strip()
    if not description:
        operation["description"] = f"{summary}."

    request_body = operation.get("requestBody")
    if isinstance(request_body, dict):
        if not str(request_body.get("description", "")).strip():
            request_body["description"] = "JSON request payload."

    responses = operation.get("responses")
    if not isinstance(responses, dict):
        return
    for status_code, response in responses.items():
        if not isinstance(response, dict):
            continue
        existing_description = str(response.get("description", "")).strip()
        if not existing_description or existing_description in _GENERIC_RESPONSE_DESCRIPTIONS:
            response["description"] = _HTTP_RESPONSE_DESCRIPTIONS.get(
                str(status_code),
                "Request processed.",
            )


def _inject_tagged_operation_openapi_docs(openapi_schema: dict[str, Any]) -> None:
    """Ensure targeted-tag operations expose consistent OpenAPI docs and examples."""
    components = openapi_schema.get("components")
    if not isinstance(components, dict):
        return
    paths = openapi_schema.get("paths")
    if not isinstance(paths, dict):
        return

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if not isinstance(operation, dict):
                continue
            tags = operation.get("tags")
            if not isinstance(tags, list):
                continue
            if not _OPENAPI_EXAMPLE_TAGS.intersection(tags):
                continue

            _normalize_operation_docs(operation=operation, method=method, path=path)

            request_body = operation.get("requestBody")
            if isinstance(request_body, dict):
                request_content = request_body.get("content")
                if isinstance(request_content, dict):
                    _inject_json_content_example(content=request_content, components=components)

            responses = operation.get("responses")
            if isinstance(responses, dict):
                for response in responses.values():
                    if not isinstance(response, dict):
                        continue
                    response_content = response.get("content")
                    if isinstance(response_content, dict):
                        _inject_json_content_example(
                            content=response_content, components=components
                        )


def build_custom_openapi(fastapi_app: FastAPI) -> dict[str, Any]:
    """Generate OpenAPI schema with normalized docs/examples for targeted tags."""
    if fastapi_app.openapi_schema:
        return fastapi_app.openapi_schema
    openapi_schema = get_openapi(
        title=fastapi_app.title,
        version=fastapi_app.version,
        openapi_version=fastapi_app.openapi_version,
        description=fastapi_app.description,
        routes=fastapi_app.routes,
        tags=fastapi_app.openapi_tags,
        servers=fastapi_app.servers,
    )
    _inject_tagged_operation_openapi_docs(openapi_schema)
    fastapi_app.openapi_schema = openapi_schema
    return fastapi_app.openapi_schema
