
import React, { useState } from 'react';
import { FileCode, GitBranch, Search, Settings, ChevronRight, Play, X, Save, Box, Command } from 'lucide-react';

const mockFiles = [
    { name: 'agent_core.ts', language: 'typescript', content: `import { Agent } from '@nexus/core';\n\nclass SecureAgent extends Agent {\n  constructor() {\n    super({ role: 'SecOps', clearances: ['L1', 'L2'] });\n  }\n\n  async scan() {\n    await this.neuralLink.establish();\n    return this.kernel.audit();\n  }\n}` },
    { name: 'neural_net.py', language: 'python', content: `import torch\nimport nexus_bridge\n\ndef forward(x):\n    # Quantized weights for edge inference\n    x = self.layer1(x)\n    x = self.dropout(x)\n    return self.head(x)\n\n# Initialize NPU context\nctx = nexus_bridge.init_npu(device='cuda:0')` },
    { name: 'styles.css', language: 'css', content: `.glass-panel {\n  background: rgba(255, 255, 255, 0.05);\n  backdrop-filter: blur(10px);\n  border: 1px solid rgba(255, 255, 255, 0.1);\n}` },
    { name: 'manifest.json', language: 'json', content: `{\n  "name": "Nexus AIOS",\n  "version": "3.1.0",\n  "permissions": ["neural_link", "fs_read"]\n}` },
];

export function CodeEditor() {
  const [activeFile, setActiveFile] = useState(mockFiles[0]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const lines = activeFile.content.split('\n');

  return (
    <div className="flex h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm overflow-hidden">
      
      {/* Activity Bar */}
      <div className="w-12 flex flex-col items-center py-4 border-r border-[#333] bg-[#252526]">
          <div className="flex flex-col gap-6">
              <FileCode className="w-6 h-6 text-white opacity-100 cursor-pointer" />
              <Search className="w-6 h-6 text-white opacity-40 hover:opacity-100 cursor-pointer transition-opacity" />
              <GitBranch className="w-6 h-6 text-white opacity-40 hover:opacity-100 cursor-pointer transition-opacity" />
              <Box className="w-6 h-6 text-white opacity-40 hover:opacity-100 cursor-pointer transition-opacity" />
          </div>
          <div className="mt-auto flex flex-col gap-6">
              <Settings className="w-6 h-6 text-white opacity-40 hover:opacity-100 cursor-pointer transition-opacity" />
          </div>
      </div>

      {/* Sidebar Explorer */}
      {sidebarOpen && (
          <div className="w-60 bg-[#252526] border-r border-[#333] flex flex-col">
              <div className="h-9 px-4 flex items-center text-[11px] font-bold tracking-widest uppercase text-[#bbbbbb]">Explorer</div>
              <div className="flex-1 overflow-y-auto py-2">
                  <div className="px-2 mb-1 flex items-center gap-1 text-xs font-bold text-blue-400 cursor-pointer">
                      <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                      NEXUS-KERNEL
                  </div>
                  <div className="flex flex-col">
                      {mockFiles.map(file => (
                          <div 
                            key={file.name}
                            onClick={() => setActiveFile(file)}
                            className={`flex items-center gap-2 px-6 py-1 cursor-pointer hover:bg-[#2a2d2e] ${activeFile.name === file.name ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'}`}
                          >
                              <FileCode className="w-3.5 h-3.5 text-blue-300" />
                              <span className="text-xs">{file.name}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          
          {/* Tabs */}
          <div className="flex bg-[#252526] overflow-x-auto scrollbar-hide">
              {mockFiles.map(file => (
                  <div 
                    key={file.name}
                    onClick={() => setActiveFile(file)}
                    className={`
                        flex items-center gap-2 px-3 py-2.5 text-xs cursor-pointer border-r border-[#333] min-w-[120px] group
                        ${activeFile.name === file.name ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500' : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#2a2d2e] border-t-2 border-t-transparent'}
                    `}
                  >
                      <span className="flex-1 truncate">{file.name}</span>
                      <X className={`w-3.5 h-3.5 hover:bg-[#444] rounded p-0.5 ${activeFile.name === file.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                  </div>
              ))}
          </div>

          {/* Breadcrumbs / Toolbar */}
          <div className="h-8 flex items-center px-4 border-b border-[#333] gap-2 text-xs">
              <span className="text-[#888]">src</span>
              <ChevronRight className="w-3 h-3 text-[#555]" />
              <span className="text-white">{activeFile.name}</span>
              <div className="ml-auto flex items-center gap-2">
                  <button className="p-1 hover:bg-[#333] rounded"><Play className="w-3.5 h-3.5 text-green-500" /></button>
                  <button className="p-1 hover:bg-[#333] rounded"><Save className="w-3.5 h-3.5 text-[#ccc]" /></button>
              </div>
          </div>

          {/* Code View */}
          <div className="flex-1 overflow-y-auto font-mono text-[13px] leading-6 relative">
              <div className="absolute top-0 left-0 bottom-0 w-12 bg-[#1e1e1e] border-r border-[#333] flex flex-col items-end pr-3 text-[#666] select-none pt-2">
                  {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <div className="pl-16 pt-2 pb-10">
                  {lines.map((line, i) => (
                      <div key={i} className="whitespace-pre text-[#d4d4d4]">
                          {/* Simple syntax highlighting sim */}
                          {line.split(' ').map((word, j) => {
                              let color = '#d4d4d4';
                              if (['import', 'from', 'class', 'extends', 'constructor', 'super', 'async', 'return', 'def', 'if', 'else'].includes(word)) color = '#569cd6'; // Blue
                              else if (['const', 'let', 'var', 'this'].includes(word)) color = '#4fc1ff'; // Light Blue
                              else if (word.includes("'") || word.includes('"')) color = '#ce9178'; // Orange/Red
                              else if (word.includes('(') || word.includes(')')) color = '#dcdcaa'; // Yellow
                              else if (word.startsWith('//') || word.startsWith('#')) color = '#6a9955'; // Green
                              
                              return <span key={j} style={{ color }}>{word} </span>;
                          })}
                      </div>
                  ))}
                  <div className="h-4 w-0.5 bg-white animate-pulse mt-1" />
              </div>
          </div>

          {/* Status Bar */}
          <div className="h-6 bg-[#007acc] text-white flex items-center px-3 text-[11px] justify-between select-none">
              <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> main*</div>
                  <div className="flex items-center gap-1"><X className="w-3 h-3 rounded-full bg-white/20 p-0.5" /> 0 Errors</div>
              </div>
              <div className="flex items-center gap-4">
                  <span>Ln {lines.length}, Col 1</span>
                  <span>UTF-8</span>
                  <span className="uppercase">{activeFile.language}</span>
                  <div className="hover:bg-white/20 p-0.5 rounded cursor-pointer">
                      <Command className="w-3 h-3" />
                  </div>
              </div>
          </div>

      </div>
    </div>
  );
}
