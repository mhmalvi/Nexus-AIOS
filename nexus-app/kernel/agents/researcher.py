from typing import Dict, Any, List
import json
import asyncio

class ResearchAgent:
    """
    Specialized agent for web research and information synthesis.
    Can scrape websites, summarize content, and answer questions based on web data.
    """
    
    def __init__(self, brain, toolbox):
        self.brain = brain
        self.toolbox = toolbox
        
    async def research_topic(self, topic: str, urls: List[str] = None) -> Dict[str, Any]:
        """
        Research a topic by analyzing specific URLs.
        If no URLs provided, returns a plan to find them (since we lack search engine API).
        """
        
        if not urls:
             # Without a search engine, we ask the Brain to hallucinate potential URLs or ask user
             # Since we can't search, we return a request for data
             return {
                 "success": False,
                 "error": "No URLs provided. Please provide URLs to research.",
                 "topic": topic
             }
             
        summaries = []
        raw_data = ""
        
        for url in urls:
            try:
                # Use Toolbox to scrape
                result = await self.toolbox.execute("web", args=[url], kwargs={"method": "GET"})
                
                if result.success:
                    # We might need to clean the HTML if it's raw
                    # But if toolbox.web uses scrape_text, we are good.
                    # Wait, toolbox.web.request returns raw, but toolbox.web.scrape_text exists
                    # Toolbox dispatch for "web" calls "request".
                    # We should call web.scrape_text directly if possible, or assume raw HTML and let Brain handle it
                    
                    # Better: Access web automation directly via toolbox.web
                    if hasattr(self.toolbox.web, "scrape_text"):
                        scrape_res = await self.toolbox.web.scrape_text(url)
                        if scrape_res.success:
                            text = scrape_res.output[:10000] # Limit context
                        else:
                            text = str(result.output)[:10000]
                    else:
                        text = str(result.output)[:10000]
                        
                    raw_data += f"\n--- Source: {url} ---\n{text}\n"
                    summaries.append(f"Analyzed {url}")
                else:
                    summaries.append(f"Failed to access {url}: {result.error}")
                    
            except Exception as e:
                summaries.append(f"Error processing {url}: {str(e)}")
                
        # Synthesize with Brain
        prompt = f"""
        Topic: {topic}
        
        Research Data:
        {raw_data[:20000]} 
        
        Task: Provide a detailed summary answering the topic based on the data.
        """
        
        report = await self.brain.generate(prompt)
        
        return {
            "success": True,
            "topic": topic,
            "report": report,
            "sources": urls,
            "log": summaries
        }
    
    async def analyze_task(self, task_description: str) -> Dict[str, Any]:
        """Analyze a task from a research perspective (for War Room)"""
        prompt = f"""As a Research Analyst, analyze this task for information needs:

Task: {task_description}

Consider:
1. What information/data is needed?
2. Potential sources of knowledge
3. Gaps in understanding
4. Related domains or topics to explore

Provide a brief research assessment."""
        
        try:
            analysis = await self.brain.generate(prompt, temperature=0.2, max_tokens=300)
            return {"agent": "researcher", "analysis": analysis}
        except Exception as e:
            return {"agent": "researcher", "error": str(e)}
