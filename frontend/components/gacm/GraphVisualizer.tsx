'use client';

import { useEffect, useRef, useState } from 'react';
import cytoscape, { Core, NodeSingular } from 'cytoscape';
import { GACMNode, GACMEdge, CytoscapeElement } from '@/types/gacm';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw, Info, X } from '@/components/gacm/Icons';

interface GraphVisualizerProps {
  nodes: GACMNode[];
  edges: GACMEdge[];
  highlightNodeIds?: string[];
  className?: string;
  canvasHeight?: string;
}

export default function GraphVisualizer({
  nodes,
  edges,
  highlightNodeIds = [],
  className = '',
  canvasHeight = 'h-[620px]'
}: GraphVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<GACMNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Transform GACM nodes and edges into Cytoscape format
    const elements: CytoscapeElement[] = [];

    // Nodes
    nodes.forEach((n) => {
      let displayLabel = n.properties?.name || n.properties?.title || n.label || String(n.id);
      if (displayLabel.length > 25) {
        displayLabel = displayLabel.substring(0, 22) + '...';
      }

      elements.push({
        data: {
          id: String(n.id),
          label: displayLabel,
          type: n.type || 'Node',
          properties: n.properties
        },
        classes: highlightNodeIds.includes(String(n.id)) ? 'highlighted' : ''
      });
    });

    // Edges
    edges.forEach((e) => {
      elements.push({
        data: {
          id: `edge-${e.source}-${e.target}`,
          source: String(e.source),
          target: String(e.target),
          relation: e.relation
        }
      });
    });

    // Destroy existing instance
    if (cyRef.current) {
      try {
        cyRef.current.destroy();
      } catch (_) {}
    }

    // Initialize Cytoscape with COSE physics layout to spread out nodes comfortably
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements as any,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#64748b',
            'label': 'data(label)',
            'color': '#0f172a',
            'font-size': '11px',
            'font-weight': 'bold',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.95,
            'text-background-padding': '2px',
            'text-border-width': 1,
            'text-border-color': '#cbd5e1',
            'width': 26,
            'height': 26,
            'border-width': 2,
            'border-color': '#ffffff'
          }
        },
        // Color coding per Node Entity Type
        {
          selector: 'node[type = "Faculty"]',
          style: {
            'background-color': '#d97706', // Amber Gold
            'border-color': '#b45309'
          }
        },
        {
          selector: 'node[type = "Project"]',
          style: {
            'background-color': '#2563eb', // Royal Blue
            'border-color': '#1d4ed8'
          }
        },
        {
          selector: 'node[type = "Grant"]',
          style: {
            'background-color': '#059669', // Emerald Green
            'border-color': '#047857'
          }
        },
        {
          selector: 'node[type = "Department"]',
          style: {
            'background-color': '#7c3aed', // Purple
            'border-color': '#6d28d9'
          }
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 4,
            'border-color': '#dc2626',
            'background-color': '#f59e0b',
            'width': 32,
            'height': 32
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            'label': 'data(relation)',
            'font-size': '9px',
            'color': '#334155',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 600,
        refresh: 20,
        fit: true,
        padding: 45,
        nodeRepulsion: () => 14000, // Wide repulsion force to prevent overlapping
        idealEdgeLength: () => 110,
        edgeElasticity: () => 100,
        nestingFactor: 1.2,
        gravity: 0.2,
        numIter: 1000,
        initialTemp: 1000,
        coolingFactor: 0.99,
        minTemp: 1.0
      } as any
    });

    // Click listener for node details inspector
    cy.on('tap', 'node', (evt) => {
      const node: NodeSingular = evt.target;
      const data = node.data();
      setSelectedNode({
        id: data.id,
        label: data.type || 'Node',
        type: data.type || 'Node',
        properties: data.properties || {}
      });
    });

    cyRef.current = cy;

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [nodes, edges, highlightNodeIds]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleReset = () => {
    cyRef.current?.fit();
    cyRef.current?.center();
  };

  return (
    <div className={`relative bg-white border border-slate-300 rounded-none shadow-sm overflow-hidden ${className}`}>
      
      {/* Floating Right Legend & Zoom Controls Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        {/* Right Legend Box */}
        <div className="flex flex-wrap items-center gap-3 bg-white/95 backdrop-blur-md px-3.5 py-2 border border-slate-300 text-[11px] text-slate-800 shadow-xl">
          <span className="font-extrabold text-navy uppercase text-[10px] tracking-wider border-r border-slate-300 pr-2">Legend</span>
          <div className="flex items-center gap-1.5 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block border border-white"></span> Faculty / Speaker</div>
          <div className="flex items-center gap-1.5 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block border border-white"></span> Project / Q&A</div>
          <div className="flex items-center gap-1.5 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block border border-white"></span> Grant</div>
          <div className="flex items-center gap-1.5 font-bold"><span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block border border-white"></span> Department</div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 border border-slate-300 shadow-lg">
          <button onClick={handleZoomIn} title="Zoom In" className="p-1.5 text-slate-700 hover:text-navy hover:bg-slate-100 transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleZoomOut} title="Zoom Out" className="p-1.5 text-slate-700 hover:text-navy hover:bg-slate-100 transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleReset} title="Reset View" className="p-1.5 text-slate-700 hover:text-navy hover:bg-slate-100 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"} className="p-1.5 text-slate-700 hover:text-navy hover:bg-slate-100 transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Cytoscape Canvas */}
      <div
        ref={containerRef}
        className={`w-full bg-white ${isFullscreen ? 'fixed inset-0 z-50 bg-white h-screen w-screen' : canvasHeight}`}
      />

      {/* Node Inspector Drawer */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 md:w-80 z-20 bg-white/95 backdrop-blur-md border border-slate-300 p-3.5 shadow-2xl text-slate-800 text-xs">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-600" />
              <h4 className="font-bold text-xs text-navy">{selectedNode.properties.name || selectedNode.properties.title || selectedNode.id}</h4>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1 text-slate-700 text-[11px]">
            <p><span className="text-slate-500">Entity Type:</span> <span className="font-bold text-amber-700">{selectedNode.type}</span></p>
            {selectedNode.properties.department && (
              <p><span className="text-slate-500">Department:</span> {selectedNode.properties.department}</p>
            )}
            {selectedNode.properties.institution && (
              <p><span className="text-slate-500">Institution:</span> {selectedNode.properties.institution}</p>
            )}
            {selectedNode.properties.amount && (
              <p><span className="text-slate-500">Award Amount:</span> ${Number(selectedNode.properties.amount).toLocaleString()}</p>
            )}
            {selectedNode.properties.abstract && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <span className="text-slate-500 block mb-0.5 font-bold">Abstract / Q&A Context:</span>
                <p className="text-slate-600 line-clamp-4 leading-tight">{selectedNode.properties.abstract}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
