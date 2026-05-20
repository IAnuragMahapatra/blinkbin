# BlinkBin

BlinkBin is a zero-knowledge ephemeral secret sharing platform. The server cannot read user data at any point in its lifecycle. All encryption happens client-side in the browser. The system stores only ciphertext and enforces expiration dates set at creation time.

## Core Features

- **Zero-Knowledge Architecture:** The server cannot decrypt data even if compromised.
- **Dead Drop Time-Lock:** Cryptographically seal pastes until a specific future date using the drand network.
- **No Footprints:** The platform requires no accounts and logs no IP addresses.
- **Developer-Focused:** Includes syntax highlighting via Prism.js and markdown rendering via marked.js.

## Architecture

The system is built to isolate components and minimise attack surfaces.

- **Frontend:** Hosted on Nginx on EC2 using vanilla JavaScript.
- **Backend:** Python asynchronous API using FastAPI.
- **Storage:** Redis with AOF and RDB persistence handles all paste storage.
- **Event Bus:** A Kafka topic handles expiration events and triggers deletion workers.
- **Network:** A Cloudflare Tunnel exposes the Nginx container (serving frontend and proxying the backend) to ensure no inbound ports are open on the host machine.

## Encryption Mechanics

Security relies heavily on Web Crypto API primitives and deterministic key derivation.

### Client-Side AES Encryption

The browser encrypts every piece of data using AES-256-GCM before it leaves the client. The encryption key is placed in the URL fragment. Browsers do not send URL fragments to servers so the backend only receives ciphertext.

### Password Wrapping

If you add a password to your paste, the browser generates a random salt and derives a key using PBKDF2 with 100,000 iterations. It uses this derived key to wrap the original AES key. This ensures only people who have the link and the password can read the content.

### Dead Drop Time-Lock

The Dead Drop feature uses the drand network to lock a paste until a future date. When you set an unlock time, the browser calculates the specific drand round for that moment. It then encrypts the AES key using Identity-Based Encryption against that future round.

The private key for that round does not exist anywhere until the exact unlock time. Early decryption is mathematically impossible rather than just restricted by server policy.

## Data Expiration and Storage

Pastes are completely ephemeral. You can configure them to burn after the first read, burn after a specific time or expire at the hard cap of 30 days.

Redis handles the burn on read condition atomically using a single fetch and delete command. For time-based expiration, a dedicated Python worker consumes Kafka events to delete the records exactly when they expire.

## Local Paste History

You can save your paste history locally in your browser. The system uses deterministic key derivation with Elliptic Curve Diffie-Hellman to encrypt the history blob. You set a local password to derive the master scalar. The private key only exists in memory and is never saved. The history is permanently unrecoverable if you lose the password.
