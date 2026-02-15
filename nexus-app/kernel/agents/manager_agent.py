"""
Nexus Manager Agent - Task Orchestration
Decomposes tasks and coordinates worker agents
"""

import asyncio
from typing import Dict, Any, List, Optional
from .worker_agent import StepResult


class ManagerAgent:
    """Manager Agent - Orchestrates Multi-Step Tasks"""
    
    def __init__(self, brain, worker, security_auditor=None, code_architect=None, researcher=None, qa_engineer=None, failure_limit: int = 3, memory=None):
        self.brain = brain
        self.worker = worker
        self.security_auditor = security_auditor
        self.code_architect = code_architect
        self.researcher = researcher
        self.qa_engineer = qa_engineer
        self.max_retries = failure_limit
        self.memory = memory  # Memory manager for persisting task results
    
    async def execute_task(self, description: str, auto_approve: bool = False) -> Dict[str, Any]:
        """Execute a complete task"""
        
        # Get available tools
        tools = self.worker.toolbox.list_tools()
        
        # Inject specialized agent capabilities
        if self.security_auditor:
            tools.append({
                "name": "security_audit",
                "description": "Audit/Scan code for security risks. Args: code (str), language (str)",
                "args": {"code": "string", "language": "string"}
            })
        if self.code_architect:
            tools.append({
                "name": "architect_design",
                "description": "Design software architecture/structure. Args: requirements (str)",
                "args": {"requirements": "string"}
            })
        if self.researcher:
            tools.append({
                "name": "research_topic",
                "description": "Research a topic via web. Args: topic (str), urls (List[str])",
                "args": {"topic": "string", "urls": "list<string>"}
            })
        if self.qa_engineer:
             tools.append({
                "name": "generate_tests",
                "description": "Generate unit tests for a file. Args: target_file (str)",
                "args": {"target_file": "string"}
            })
        
        # Create plan using brain
        plan = await self.brain.plan(description, tools)
        
        # TAO: Emission - Thought (Plan created)
        self._emit_tao("THOUGHT", f"Plan created with {len(plan.steps)} steps", details={"steps": [s.action for s in plan.steps]})
        
        results = []
        results_by_id: Dict[str, StepResult] = {}
        retry_count = 0
        failed = False

        # Build execution waves: group steps whose dependencies are all satisfied
        remaining = list(plan.steps)

        while remaining and not failed:
            # Find steps whose dependencies are all completed successfully
            ready = []
            still_waiting = []
            for step in remaining:
                deps_met = all(
                    dep_id in results_by_id and results_by_id[dep_id].success
                    for dep_id in (step.depends_on or [])
                )
                if deps_met:
                    ready.append(step)
                else:
                    # Check if any dependency failed (unrecoverable)
                    deps_failed = any(
                        dep_id in results_by_id and not results_by_id[dep_id].success
                        for dep_id in (step.depends_on or [])
                    )
                    if deps_failed:
                        # Skip this step — a dependency failed
                        result = StepResult(step_id=step.id, success=False, output=None,
                                            error=f"Skipped: dependency failed")
                        results.append(result)
                        results_by_id[step.id] = result
                    else:
                        still_waiting.append(step)

            if not ready:
                # No steps can proceed — all remaining are blocked
                for step in still_waiting:
                    result = StepResult(step_id=step.id, success=False, output=None,
                                        error="Blocked: unresolvable dependency")
                    results.append(result)
                    results_by_id[step.id] = result
                break

            remaining = still_waiting

            # Execute ready steps in parallel if multiple, sequential if single
            if len(ready) > 1:
                self._emit_tao("THOUGHT", f"Executing {len(ready)} independent steps in parallel",
                               details={"steps": [s.action for s in ready]})

            async def _execute_single_step(step):
                self._emit_tao("ACTION", f"Executing tool: {step.tool}", step.id,
                               details={"tool": step.tool, "args": step.args})
                return await self._dispatch_step(step, description)

            if len(ready) == 1:
                step = ready[0]
                self._emit_tao("THOUGHT", f"Starting step: {step.action}", step.id)
                result = await _execute_single_step(step)
                wave_results = [(step, result)]
            else:
                tasks = [_execute_single_step(s) for s in ready]
                raw_results = await asyncio.gather(*tasks, return_exceptions=True)
                wave_results = []
                for step, res in zip(ready, raw_results):
                    if isinstance(res, Exception):
                        res = StepResult(step_id=step.id, success=False, output=None, error=str(res))
                    wave_results.append((step, res))

            # Process wave results
            for step, result in wave_results:
                self._emit_tao("OBSERVATION",
                               f"Step result: {'Success' if result.success else 'Failed'}",
                               step.id,
                               details={"output": str(result.output)[:200], "error": result.error})
                results.append(result)
                results_by_id[step.id] = result

                if not result.success:
                    if hasattr(result, 'needs_retry') and result.needs_retry and retry_count < self.max_retries:
                        retry_count += 1
                        corrected = await self._retry_with_correction(step, result.correction, description)
                        results.append(corrected)
                        results_by_id[step.id] = corrected
                        if not corrected.success:
                            failed = True
                    else:
                        failed = True

        success = all(r.success for r in results)

        task_result = {
            "success": success,
            "task": description,
            "steps_executed": len(results),
            "parallel_waves": len([r for r in results if r.success]),
            "results": [{"step": r.step_id, "success": r.success, "output": r.output, "error": r.error} for r in results]
        }

        # Persist task result to memory for cross-session recall
        await self._persist_task_result(description, task_result)

        return task_result

    async def _dispatch_step(self, step, description: str) -> StepResult:
        """Dispatch a single step to the appropriate agent or worker."""
        if step.tool == "security_audit" and self.security_auditor:
            try:
                audit_res = await self.security_auditor.audit_code(
                    code=step.args.get("code", ""),
                    language=step.args.get("language", "python")
                )
                return StepResult(step_id=step.id, success=True, output=audit_res, error=None)
            except Exception as e:
                return StepResult(step_id=step.id, success=False, output=None, error=str(e))

        elif step.tool == "architect_design" and self.code_architect:
            try:
                design_res = await self.code_architect.design_feature(
                    requirements=step.args.get("requirements", "")
                )
                return StepResult(step_id=step.id, success=True, output=design_res, error=None)
            except Exception as e:
                return StepResult(step_id=step.id, success=False, output=None, error=str(e))

        elif step.tool == "research_topic" and self.researcher:
            try:
                res = await self.researcher.research_topic(
                    topic=step.args.get("topic", ""),
                    urls=step.args.get("urls", [])
                )
                return StepResult(step_id=step.id, success=res["success"], output=res, error=res.get("error"))
            except Exception as e:
                return StepResult(step_id=step.id, success=False, output=None, error=str(e))

        elif step.tool == "generate_tests" and self.qa_engineer:
            try:
                res = await self.qa_engineer.generate_tests(
                    target_file=step.args.get("target_file", ""),
                    context=step.args.get("context", "")
                )
                return StepResult(step_id=step.id, success=res["success"], output=res, error=res.get("error"))
            except Exception as e:
                return StepResult(step_id=step.id, success=False, output=None, error=str(e))

        else:
            return await self.worker.execute_step(
                step={"id": step.id, "tool": step.tool, "action": step.action, "args": step.args},
                context=description
            )
    
    async def _retry_with_correction(self, step, correction: str, context: str):
        """Retry a step with correction applied"""
        
        # Use LLM to apply correction
        prompt = f"Original: {step.action} Correction: {correction}. Generate corrected action."
        
        try:
            corrected_action = await self.brain.generate(prompt=prompt, temperature=0.2, max_tokens=100)
            corrected_step = {"id": f"{step.id}_retry", "tool": step.tool, "action": corrected_action, "args": step.args}
            return await self.worker.execute_step(corrected_step, context)
        except Exception as e:
            from .worker_agent import StepResult
            return StepResult(step_id=f"{step.id}_retry", success=False, output=None, error=str(e))
    
    # ========== War Room Feature ==========
    
    async def hold_war_room(
        self,
        task_description: str,
        include_agents: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Hold a 'War Room' session - consult multiple specialized agents in parallel.
        
        This enables complex problem-solving by gathering diverse perspectives
        from Security, Code Architecture, Research, and QA agents.
        
        Args:
            task_description: The problem or task to analyze
            include_agents: List of agent types to include (default: all available)
                           Options: "security", "architect", "researcher", "qa"
        
        Returns:
            Aggregated analysis from all consulted agents
        """
        agents_to_consult = include_agents or ["security", "architect", "researcher", "qa"]
        consultation_tasks = []
        agent_names = []
        
        # Prepare parallel consultation tasks
        if "security" in agents_to_consult and self.security_auditor:
            async def security_consult():
                try:
                    return await self.security_auditor.analyze_task(task_description)
                except Exception as e:
                    return {"agent": "security", "error": str(e)}
            consultation_tasks.append(security_consult())
            agent_names.append("security")
        
        if "architect" in agents_to_consult and self.code_architect:
            async def architect_consult():
                try:
                    return await self.code_architect.analyze_task(task_description)
                except Exception as e:
                    return {"agent": "architect", "error": str(e)}
            consultation_tasks.append(architect_consult())
            agent_names.append("architect")
        
        if "researcher" in agents_to_consult and self.researcher:
            async def researcher_consult():
                try:
                    return await self.researcher.analyze_task(task_description)
                except Exception as e:
                    return {"agent": "researcher", "error": str(e)}
            consultation_tasks.append(researcher_consult())
            agent_names.append("researcher")
        
        if "qa" in agents_to_consult and self.qa_engineer:
            async def qa_consult():
                try:
                    return await self.qa_engineer.analyze_task(task_description)
                except Exception as e:
                    return {"agent": "qa", "error": str(e)}
            consultation_tasks.append(qa_consult())
            agent_names.append("qa")
        
        if not consultation_tasks:
            return {
                "success": False,
                "error": "No agents available for consultation",
                "task": task_description
            }
        
        # Execute all consultations in parallel
        results = await asyncio.gather(*consultation_tasks, return_exceptions=True)
        
        # Aggregate results
        agent_opinions = {}
        for name, result in zip(agent_names, results):
            if isinstance(result, Exception):
                agent_opinions[name] = {"error": str(result)}
            else:
                agent_opinions[name] = result
        
        # Synthesize a unified recommendation using the Brain
        synthesis_prompt = f"""You are synthesizing opinions from multiple specialized agents about this task:
Task: {task_description}

Agent Opinions:
{self._format_opinions(agent_opinions)}

Provide a unified recommendation that considers all perspectives. Identify:
1. Points of agreement
2. Potential conflicts or concerns
3. Recommended approach

Unified Recommendation:"""
        
        try:
            synthesis = await self.brain.generate(
                prompt=synthesis_prompt,
                temperature=0.4,
                max_tokens=500
            )
        except Exception as e:
            synthesis = f"Failed to synthesize: {e}"
        
        return {
            "success": True,
            "task": task_description,
            "agents_consulted": agent_names,
            "agent_opinions": agent_opinions,
            "synthesis": synthesis
        }
    
    def _format_opinions(self, opinions: Dict[str, Any]) -> str:
        """Format agent opinions for synthesis prompt"""
        formatted = []
        for agent, opinion in opinions.items():
            if "error" in opinion:
                formatted.append(f"[{agent.upper()}]: Error - {opinion['error']}")
            else:
                # Handle different response formats
                if isinstance(opinion, dict):
                    content = opinion.get("analysis", opinion.get("output", str(opinion)))
                else:
                    content = str(opinion)
                formatted.append(f"[{agent.upper()}]: {content}")
        return "\n\n".join(formatted)

    async def _persist_task_result(self, description: str, task_result: Dict[str, Any]):
        """Persist a completed task result to Tier 2 (short-term) memory for cross-session recall."""
        if not self.memory:
            return
        try:
            success = task_result.get("success", False)
            steps = task_result.get("steps_executed", 0)
            summary = f"Task {'completed' if success else 'failed'}: {description} ({steps} steps)"
            await self.memory.store(
                content=summary,
                tier="short_term",
                metadata={
                    "source": "manager_agent",
                    "type": "task_result",
                    "success": success,
                    "steps_executed": steps,
                    "task_description": description,
                }
            )
        except Exception as e:
            import sys
            print(f"⚠️ Memory persistence failed: {e}", file=sys.stderr)

    def _emit_tao(self, tao_type: str, content: str, step_id: str = None, details: Dict[str, Any] = None):
        """Emit a Thought-Action-Observation event via stdout for UI visualization"""
        import json
        import sys
        
        event = {
            "id": f"tao_{step_id or 'gen'}",
            "message_type": "tao_event",
            "timestamp": None, # Will be added by receiver or logic
            "data": {
                "type": tao_type, # THOUGHT, ACTION, OBSERVATION
                "content": content,
                "step_id": step_id,
                "details": details or {}
            }
        }
        
        # We perform a direct print here because ManagerAgent doesn't always have access to the main Kernel's _emit_event
        # Ideally, we should inject an event_emitter callback, but for now stdout matches the architecture.
        print(json.dumps(event), flush=True)

