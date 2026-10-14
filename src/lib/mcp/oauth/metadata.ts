// Discovery documents for the Claude connector.
//
//   /.well-known/oauth-protected-resource/mcp   RFC 9728: "the /mcp
//       resource is protected by this authorization server"
//   /.well-known/oauth-authorization-server     RFC 8414: endpoints,
//       PKCE S256, public clients, dynamic registration

import { SUPPORTED_SCOPES, issuer, mcpOrigin, resourceUrl } from "@/lib/mcp/config";

export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Compass",
    resource_documentation: `${mcpOrigin()}/security`,
  };
}

export function authorizationServerMetadata() {
  const o = mcpOrigin();
  return {
    issuer: issuer(),
    authorization_endpoint: `${o}/mcp/oauth/authorize`,
    token_endpoint: `${o}/mcp/oauth/token`,
    registration_endpoint: `${o}/mcp/oauth/register`,
    revocation_endpoint: `${o}/mcp/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  };
}
