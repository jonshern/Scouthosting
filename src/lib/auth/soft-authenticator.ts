// A software WebAuthn authenticator for tests: makes "none"-attestation
// passkeys (ES256) and signs assertions the way a phone or laptop would,
// so passkey flows can be tested end to end without a browser.

import crypto from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | Buffer | string) => crypto.createHash("sha256").update(b).digest();

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentialId = crypto.randomBytes(16);
  private readonly keys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  private counter = 0;
  userHandle = "";

  constructor(private readonly opts: { userVerified?: boolean } = {}) {}

  get id(): string {
    return b64u(this.credentialId);
  }

  private flags(extra = 0): number {
    return FLAG_UP | (this.opts.userVerified === false ? 0 : FLAG_UV) | extra;
  }

  private cosePublicKey(): Uint8Array {
    const jwk = this.keys.publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const map = new Map<number, number | Uint8Array>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))],
    ]);
    return isoCBOR.encode(map);
  }

  /** Answer navigator.credentials.create() for these options. */
  register(options: { challenge: string; rp: { id?: string }; user: { id: string } }, origin: string) {
    this.userHandle = options.user.id;
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(options.rp.id ?? ""),
      Buffer.from([this.flags(FLAG_AT)]),
      Buffer.alloc(4), // sign count 0
      Buffer.alloc(16), // aaguid
      idLen,
      this.credentialId,
      Buffer.from(this.cosePublicKey()),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", new Uint8Array(authData)],
      ]) as never,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ["internal" as const],
      },
      clientExtensionResults: {},
    };
  }

  /** Answer navigator.credentials.get() for these options. */
  authenticate(options: { challenge: string; rpId?: string }, origin: string) {
    this.counter += 1;
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(options.rpId ?? ""), Buffer.from([this.flags()]), count]);
    const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: this.userHandle || undefined,
      },
      clientExtensionResults: {},
    };
  }
}
