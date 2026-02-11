---
name: nexus-chat
description: Send messages to the Nexus AI assistant and receive streaming responses.
metadata:
  nexus:
    emoji: "💬"
    requires:
      services: ["nexus-kernel"]
---

# Nexus Chat

Talk to the Nexus AI assistant.

## Quick Start

```
nexus chat "What's the weather like?"
```

## Streaming Mode

Responses stream token-by-token for minimal latency:

```
nexus chat --stream "Explain quantum computing"
```

## Context

You can provide file context:

```
nexus chat --file ./report.py "Summarize this code"
```

## Models

Override the default model:

```
nexus chat --model mistral "Write a haiku"
```
