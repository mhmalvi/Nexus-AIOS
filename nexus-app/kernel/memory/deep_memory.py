"""
AETHER Deep Memory — 4th Tier Knowledge Graph

The deepest layer of AETHER's 4-tier memory hierarchy:
- Tier 1: Working Memory (LLM context window — volatile)
- Tier 2: Session Memory (recent events — 7-day TTL)
- Tier 3: Knowledge Memory (long-term vector store — persistent)
- Tier 4: Deep Memory (knowledge graph — this module)

Deep Memory stores:
- Entity relationships (person → works_at → company)
- Learned preferences (user prefers dark mode)
- Behavioral patterns (user codes at night)
- Tool usage history (user uses git 50x/day)
- Semantic connections between concepts

Features:
- Graph-based entity storage with typed edges
- Temporal decay (less-accessed knowledge fades)
- Confidence scoring (frequently reinforced = stronger)
- LLM-powered entity extraction from conversations
- JSON persistence (upgradeable to Neo4j/SQLite)
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Set, Tuple

logger = logging.getLogger("aether.deep_memory")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class EntityType(str, Enum):
    PERSON = "person"
    PLACE = "place"
    ORGANIZATION = "organization"
    PROJECT = "project"
    TOOL = "tool"
    CONCEPT = "concept"
    PREFERENCE = "preference"
    PATTERN = "pattern"
    FILE = "file"
    EVENT = "event"
    CUSTOM = "custom"


class EdgeType(str, Enum):
    WORKS_AT = "works_at"
    KNOWS = "knows"
    USES = "uses"
    PREFERS = "prefers"
    CREATED = "created"
    RELATED_TO = "related_to"
    PART_OF = "part_of"
    DEPENDS_ON = "depends_on"
    LOCATED_IN = "located_in"
    SCHEDULES = "schedules"
    TRIGGERS = "triggers"
    CUSTOM = "custom"


@dataclass
class Entity:
    """A node in the knowledge graph."""
    id: str
    name: str
    entity_type: EntityType
    properties: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    access_count: int = 0
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    source: str = ""  # Where this knowledge came from

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["entity_type"] = self.entity_type.value
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Entity":
        d["entity_type"] = EntityType(d.get("entity_type", "custom"))
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Edge:
    """A relationship between two entities."""
    id: str
    source_id: str
    target_id: str
    edge_type: EdgeType
    label: str = ""                 # Human-readable label
    properties: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    weight: float = 1.0            # Strength of relationship
    created_at: float = field(default_factory=time.time)
    reinforced_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["edge_type"] = self.edge_type.value
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Edge":
        d["edge_type"] = EdgeType(d.get("edge_type", "custom"))
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class GraphQuery:
    """Result of a knowledge graph query."""
    entities: List[Entity]
    edges: List[Edge]
    paths: List[List[str]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Deep Memory Engine
# ---------------------------------------------------------------------------

class DeepMemory:
    """
    AETHER's 4th memory tier — Knowledge Graph.

    Stores entities and their relationships as a directed graph.
    Supports traversal, pattern detection, and LLM-assisted extraction.

    Usage:
        dm = DeepMemory()
        await dm.initialize()

        # Add entities
        user_id = dm.add_entity("Davin", EntityType.PERSON, {"role": "developer"})
        project_id = dm.add_entity("AETHER", EntityType.PROJECT, {"type": "AI OS"})

        # Connect them
        dm.add_edge(user_id, project_id, EdgeType.CREATED)

        # Query
        results = dm.query_neighbors(user_id)
        patterns = dm.find_user_preferences()
    """

    def __init__(self, persist_path: Optional[str] = None):
        self._entities: Dict[str, Entity] = {}
        self._edges: Dict[str, Edge] = {}
        
        # Index: entity_id → list of edge_ids
        self._outgoing: Dict[str, List[str]] = {}
        self._incoming: Dict[str, List[str]] = {}
        
        # Name index for fast lookup
        self._name_index: Dict[str, str] = {}  # lower(name) → entity_id
        
        # Optional brain reference for LLM-assisted extraction
        self._brain_ref = None

        if persist_path:
            self._persist_path = Path(persist_path)
        else:
            self._persist_path = Path.home() / ".aether" / "deep_memory.json"

    async def initialize(self) -> None:
        """Load persisted graph from disk."""
        self._restore()
        logger.info(
            "Deep memory initialized: %d entities, %d edges",
            len(self._entities), len(self._edges),
        )

    def set_brain(self, brain) -> None:
        """Set the brain reference for LLM-assisted extraction."""
        self._brain_ref = brain

    # ------------------------------------------------------------------
    # Batch import pipeline (for archives and bulk data)
    # ------------------------------------------------------------------

    async def batch_ingest(
        self,
        items: List[Dict[str, Any]],
        source: str = "batch_import",
        progress_callback=None,
    ) -> Dict[str, int]:
        """
        Batch embedding pipeline for archives and bulk data.

        Each item in `items` should be a dict with:
            - name (str): entity name
            - type (str): entity type string (e.g. "person", "project")
            - properties (dict, optional): entity properties
            - relationships (list, optional): list of dicts with:
                - target (str): target entity name
                - type (str): edge type string
                - label (str, optional): edge label

        Returns:
            Dict with counts: {"entities_added", "entities_reinforced",
                                "edges_added", "edges_reinforced", "errors"}
        """
        stats = {
            "entities_added": 0,
            "entities_reinforced": 0,
            "edges_added": 0,
            "edges_reinforced": 0,
            "errors": 0,
        }
        total = len(items)

        for idx, item in enumerate(items):
            try:
                name = item.get("name", "")
                if not name:
                    stats["errors"] += 1
                    continue

                # Resolve entity type
                etype = EntityType.CUSTOM
                try:
                    etype = EntityType(item.get("type", "custom"))
                except ValueError:
                    pass

                # Check if entity already exists (reinforcement)
                existing = self._name_index.get(name.lower())
                if existing:
                    stats["entities_reinforced"] += 1
                else:
                    stats["entities_added"] += 1

                entity_id = self.add_entity(
                    name=name,
                    entity_type=etype,
                    properties=item.get("properties", {}),
                    source=source,
                )

                # Add relationships
                for rel in item.get("relationships", []):
                    target_name = rel.get("target", "")
                    if not target_name:
                        continue

                    # Ensure target entity exists
                    target_entity = self.find_entity(target_name)
                    if not target_entity:
                        # Auto-create target entity
                        target_id = self.add_entity(
                            name=target_name,
                            entity_type=EntityType.CUSTOM,
                            source=source,
                        )
                        stats["entities_added"] += 1
                    else:
                        target_id = target_entity.id

                    # Resolve edge type
                    rtype = EdgeType.RELATED_TO
                    try:
                        rtype = EdgeType(rel.get("type", "related_to"))
                    except ValueError:
                        pass

                    # Check if edge already exists
                    existing_edge = False
                    for eid in self._outgoing.get(entity_id, []):
                        edge = self._edges.get(eid)
                        if edge and edge.target_id == target_id and edge.edge_type == rtype:
                            existing_edge = True
                            break

                    if existing_edge:
                        stats["edges_reinforced"] += 1
                    else:
                        stats["edges_added"] += 1

                    self.add_edge(
                        source_id=entity_id,
                        target_id=target_id,
                        edge_type=rtype,
                        label=rel.get("label", ""),
                    )

            except Exception as e:
                logger.warning("Batch ingest error on item %d: %s", idx, e)
                stats["errors"] += 1

            # Report progress
            if progress_callback and (idx % 10 == 0 or idx == total - 1):
                try:
                    progress_callback(idx + 1, total, stats)
                except Exception:
                    pass

        # Persist after batch
        self._persist()
        logger.info(
            "Batch ingest complete: %d added, %d reinforced, %d edges, %d errors",
            stats["entities_added"], stats["entities_reinforced"],
            stats["edges_added"], stats["errors"],
        )
        return stats

    # ------------------------------------------------------------------
    # Entity operations
    # ------------------------------------------------------------------

    def add_entity(
        self,
        name: str,
        entity_type: EntityType,
        properties: Optional[Dict[str, Any]] = None,
        source: str = "",
    ) -> str:
        """
        Add an entity to the graph.

        If an entity with the same name exists, reinforces it instead.
        """
        # Check if entity already exists
        existing_id = self._name_index.get(name.lower())
        if existing_id and existing_id in self._entities:
            entity = self._entities[existing_id]
            entity.confidence = min(1.0, entity.confidence + 0.1)
            entity.access_count += 1
            entity.last_accessed = time.time()
            if properties:
                entity.properties.update(properties)
            self._persist()
            return existing_id

        entity_id = f"e_{uuid.uuid4().hex[:10]}"
        entity = Entity(
            id=entity_id,
            name=name,
            entity_type=entity_type,
            properties=properties or {},
            source=source,
        )

        self._entities[entity_id] = entity
        self._name_index[name.lower()] = entity_id
        self._outgoing[entity_id] = []
        self._incoming[entity_id] = []
        self._persist()

        logger.debug("Added entity: %s (%s)", name, entity_type.value)
        return entity_id

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get an entity by ID."""
        entity = self._entities.get(entity_id)
        if entity:
            entity.access_count += 1
            entity.last_accessed = time.time()
        return entity

    def find_entity(self, name: str) -> Optional[Entity]:
        """Find an entity by name (case-insensitive)."""
        eid = self._name_index.get(name.lower())
        if eid:
            return self.get_entity(eid)
        return None

    def search_entities(
        self,
        query: str,
        entity_type: Optional[EntityType] = None,
        limit: int = 10,
    ) -> List[Entity]:
        """Search entities by name substring."""
        query_lower = query.lower()
        results = []

        for entity in self._entities.values():
            if query_lower in entity.name.lower():
                if entity_type is None or entity.entity_type == entity_type:
                    results.append(entity)

        # Sort by confidence * access_count
        results.sort(key=lambda e: e.confidence * (e.access_count + 1), reverse=True)
        return results[:limit]

    def remove_entity(self, entity_id: str) -> bool:
        """Remove an entity and all its edges."""
        if entity_id not in self._entities:
            return False

        entity = self._entities.pop(entity_id)
        self._name_index.pop(entity.name.lower(), None)

        # Remove all connected edges
        edge_ids_to_remove = set()
        edge_ids_to_remove.update(self._outgoing.pop(entity_id, []))
        edge_ids_to_remove.update(self._incoming.pop(entity_id, []))

        for eid in edge_ids_to_remove:
            edge = self._edges.pop(eid, None)
            if edge:
                # Clean up reverse index
                if edge.source_id != entity_id:
                    out = self._outgoing.get(edge.source_id, [])
                    if eid in out:
                        out.remove(eid)
                if edge.target_id != entity_id:
                    inc = self._incoming.get(edge.target_id, [])
                    if eid in inc:
                        inc.remove(eid)

        self._persist()
        return True

    # ------------------------------------------------------------------
    # Edge operations
    # ------------------------------------------------------------------

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: EdgeType,
        label: str = "",
        properties: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Add a relationship between two entities.

        If the same edge exists, reinforces it.
        """
        # Check for existing edge
        for eid in self._outgoing.get(source_id, []):
            edge = self._edges.get(eid)
            if (edge and edge.target_id == target_id
                    and edge.edge_type == edge_type):
                edge.reinforced_count += 1
                edge.weight = min(10.0, edge.weight + 0.5)
                edge.confidence = min(1.0, edge.confidence + 0.05)
                if properties:
                    edge.properties.update(properties)
                self._persist()
                return eid

        edge_id = f"r_{uuid.uuid4().hex[:10]}"
        edge = Edge(
            id=edge_id,
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            label=label or f"{edge_type.value}",
            properties=properties or {},
        )

        self._edges[edge_id] = edge
        self._outgoing.setdefault(source_id, []).append(edge_id)
        self._incoming.setdefault(target_id, []).append(edge_id)
        self._persist()

        return edge_id

    def get_edges(
        self,
        entity_id: str,
        direction: str = "both",
        edge_type: Optional[EdgeType] = None,
    ) -> List[Edge]:
        """Get edges connected to an entity."""
        edges = []

        if direction in ("out", "both"):
            for eid in self._outgoing.get(entity_id, []):
                edge = self._edges.get(eid)
                if edge and (edge_type is None or edge.edge_type == edge_type):
                    edges.append(edge)

        if direction in ("in", "both"):
            for eid in self._incoming.get(entity_id, []):
                edge = self._edges.get(eid)
                if edge and (edge_type is None or edge.edge_type == edge_type):
                    edges.append(edge)

        return edges

    # ------------------------------------------------------------------
    # Graph queries
    # ------------------------------------------------------------------

    def query_neighbors(
        self,
        entity_id: str,
        depth: int = 1,
        edge_type: Optional[EdgeType] = None,
    ) -> GraphQuery:
        """Get entities connected to a given entity up to N hops."""
        visited_entities: Set[str] = set()
        visited_edges: Set[str] = set()
        frontier = {entity_id}

        for _ in range(depth):
            next_frontier: Set[str] = set()
            for eid in frontier:
                visited_entities.add(eid)
                for edge in self.get_edges(eid, edge_type=edge_type):
                    visited_edges.add(edge.id)
                    other_id = (
                        edge.target_id if edge.source_id == eid
                        else edge.source_id
                    )
                    if other_id not in visited_entities:
                        next_frontier.add(other_id)
            frontier = next_frontier

        visited_entities.update(frontier)

        entities = [
            self._entities[eid] for eid in visited_entities
            if eid in self._entities
        ]
        edges = [
            self._edges[eid] for eid in visited_edges
            if eid in self._edges
        ]

        return GraphQuery(entities=entities, edges=edges)

    def find_user_preferences(self) -> List[Tuple[str, Any]]:
        """Find all stored user preferences."""
        prefs = []
        for entity in self._entities.values():
            if entity.entity_type == EntityType.PREFERENCE:
                prefs.append((entity.name, entity.properties))

        # Also check PREFERS edges
        for edge in self._edges.values():
            if edge.edge_type == EdgeType.PREFERS:
                source = self._entities.get(edge.source_id)
                target = self._entities.get(edge.target_id)
                if source and target:
                    prefs.append((
                        f"{source.name} prefers {target.name}",
                        edge.properties,
                    ))

        return prefs

    def find_patterns(self) -> List[Entity]:
        """Find all stored behavioral patterns."""
        return [
            e for e in self._entities.values()
            if e.entity_type == EntityType.PATTERN
        ]

    # ------------------------------------------------------------------
    # LLM-assisted extraction
    # ------------------------------------------------------------------

    async def extract_from_conversation(
        self,
        messages: List[Dict[str, Any]],
        brain=None,
    ) -> Dict[str, int]:
        """
        Extract entities and relationships from conversation messages
        using an LLM.

        Returns counts of entities and edges added.
        """
        if not brain and not self._brain_ref:
            return {"entities": 0, "edges": 0}

        llm = brain or self._brain_ref

        # Build conversation text
        conv_text = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')}"
            for m in messages[-20:]  # Last 20 messages
        )

        prompt = (
            "Extract entities and relationships from this conversation.\n"
            "Return a JSON object with:\n"
            '  "entities": [{"name": "...", "type": "person|project|tool|preference|pattern", "properties": {...}}]\n'
            '  "edges": [{"source": "name1", "target": "name2", "type": "uses|knows|prefers|created|related_to", "label": "..."}]\n\n'
            f"Conversation:\n{conv_text}\n\n"
            "Only extract clearly stated facts. JSON only, no explanation."
        )

        try:
            response = await llm.generate(prompt=prompt)

            # Parse JSON from response
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                data = json.loads(response[json_start:json_end])

                entity_count = 0
                edge_count = 0

                # Add entities
                for ent in data.get("entities", []):
                    etype = EntityType.CUSTOM
                    try:
                        etype = EntityType(ent.get("type", "custom"))
                    except ValueError:
                        pass
                    self.add_entity(
                        name=ent["name"],
                        entity_type=etype,
                        properties=ent.get("properties", {}),
                        source="conversation_extraction",
                    )
                    entity_count += 1

                # Add edges
                for rel in data.get("edges", []):
                    source = self.find_entity(rel["source"])
                    target = self.find_entity(rel["target"])
                    if source and target:
                        rtype = EdgeType.CUSTOM
                        try:
                            rtype = EdgeType(rel.get("type", "custom"))
                        except ValueError:
                            pass
                        self.add_edge(
                            source_id=source.id,
                            target_id=target.id,
                            edge_type=rtype,
                            label=rel.get("label", ""),
                        )
                        edge_count += 1

                return {"entities": entity_count, "edges": edge_count}

        except Exception as e:
            logger.warning("Entity extraction failed: %s", e)

        return {"entities": 0, "edges": 0}

    # ------------------------------------------------------------------
    # Temporal decay
    # ------------------------------------------------------------------

    def apply_decay(self, half_life_days: int = 30) -> int:
        """
        Apply temporal decay to confidence scores.

        Entities that haven't been accessed lose confidence over time.
        Returns count of entities decayed.
        """
        now = time.time()
        half_life_seconds = half_life_days * 86400
        decayed = 0

        for entity in self._entities.values():
            age = now - entity.last_accessed
            if age > half_life_seconds:
                decay_factor = 0.5 ** (age / half_life_seconds)
                old_conf = entity.confidence
                entity.confidence = max(0.01, entity.confidence * decay_factor)
                if entity.confidence < old_conf:
                    decayed += 1

        if decayed:
            self._persist()
            logger.info("Applied decay to %d entities", decayed)

        return decayed

    def prune_low_confidence(self, threshold: float = 0.05) -> int:
        """Remove entities with confidence below threshold."""
        to_remove = [
            eid for eid, e in self._entities.items()
            if e.confidence < threshold
        ]
        for eid in to_remove:
            self.remove_entity(eid)

        if to_remove:
            logger.info("Pruned %d low-confidence entities", len(to_remove))

        return len(to_remove)

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        type_counts = {}
        for e in self._entities.values():
            type_counts[e.entity_type.value] = type_counts.get(e.entity_type.value, 0) + 1

        return {
            "total_entities": len(self._entities),
            "total_edges": len(self._edges),
            "entity_types": type_counts,
            "preferences": len(self.find_user_preferences()),
            "patterns": len(self.find_patterns()),
        }

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _persist(self) -> None:
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "entities": {eid: e.to_dict() for eid, e in self._entities.items()},
                "edges": {eid: e.to_dict() for eid, e in self._edges.items()},
            }
            tmp = self._persist_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(self._persist_path)
        except Exception as e:
            logger.warning("Failed to persist deep memory: %s", e)

    def _restore(self) -> None:
        if not self._persist_path.exists():
            return

        try:
            data = json.loads(
                self._persist_path.read_text(encoding="utf-8")
            )

            for eid, edict in data.get("entities", {}).items():
                entity = Entity.from_dict(edict)
                self._entities[eid] = entity
                self._name_index[entity.name.lower()] = eid
                self._outgoing.setdefault(eid, [])
                self._incoming.setdefault(eid, [])

            for rid, rdict in data.get("edges", {}).items():
                edge = Edge.from_dict(rdict)
                self._edges[rid] = edge
                self._outgoing.setdefault(edge.source_id, []).append(rid)
                self._incoming.setdefault(edge.target_id, []).append(rid)

            logger.info(
                "Restored deep memory: %d entities, %d edges",
                len(self._entities), len(self._edges),
            )
        except Exception as e:
            logger.warning("Failed to restore deep memory: %s", e)
