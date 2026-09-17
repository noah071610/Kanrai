import { useCallback, useEffect, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

import { openInEditor, type DbPayload, type Flow, type FlowsPayload } from "../api";
import { clearPlacements, placeNodes, routeEdges, savePlacement } from "./layout";
import { buildGraph, type StepNode, type Variant } from "./model";
import { LegendItem, nodeTypes } from "./StepNodeView";

const LEGEND: Variant[] = ["client", "start", "step", "end", "branch", "db", "api", "fail", "soft-fail", "missing"];

interface Props {
  flow: Flow;
  flows: FlowsPayload;
  db: DbPayload | null;
  selectedIds: string[];
  onSelect: (id: string | null, toggle?: boolean) => void;
  /** Bumped by the header's reset button: forget saved placement for this flow. */
  resetToken: number;
}

export function FlowCanvas(props: Props) {
  // One provider per flow: switching flows starts a fresh viewport, while live
  // updates to the same flow keep zoom, pan and positions.
  return (
    <ReactFlowProvider key={props.flow.id}>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ flow, flows, db, selectedIds, onSelect, resetToken }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const { fitView, getNodes, getEdges } = useReactFlow<StepNode>();
  const fitted = useRef(false);
  const appliedReset = useRef(resetToken);

  useEffect(() => {
    const graph = buildGraph(flow, flows, db);

    // A reset forgets both what was saved and what is on screen.
    const resetting = appliedReset.current !== resetToken;
    if (resetting) {
      appliedReset.current = resetToken;
      clearPlacements(flow.id);
      fitted.current = false;
    }
    // Otherwise what is on screen (possibly auto-placed, never dragged) keeps
    // its place across a live update.
    const onScreen = new Map(
      resetting
        ? []
        : getNodes().map((n) => [n.id, { x: n.position.x, y: n.position.y, width: n.width, height: n.height }]),
    );

    const placed = placeNodes(flow.id, graph.nodes, graph.edges, onScreen);
    setNodes(placed.map((n) => ({ ...n, selected: selectedIds.includes(n.id) })));
    setEdges(routeEdges(placed, graph.edges));
    if (!fitted.current) {
      fitted.current = true;
      requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 200 }));
    }
    // 선택 상태는 아래에서 따로 반영하므로, 선택 때마다 다시 배치하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, flows, db, resetToken]);

  useEffect(() => {
    setNodes((current) =>
      current.map((n) => {
        const selected = selectedIds.includes(n.id);
        return n.selected === selected ? n : { ...n, selected };
      }),
    );
  }, [selectedIds, setNodes]);

  const onNodeDragStop: OnNodeDrag<StepNode> = useCallback(
    (_, __, dragged) => {
      for (const n of dragged) savePlacement(flow.id, n.id, { x: n.position.x, y: n.position.y });
      setEdges(routeEdges(getNodes(), getEdges()));
    },
    [flow.id, getNodes, getEdges, setEdges],
  );

  const onNodeClick: NodeMouseHandler<StepNode> = useCallback(
    (event, node) => onSelect(node.id, event.metaKey),
    [onSelect],
  );
  const onNodeDoubleClick: NodeMouseHandler<StepNode> = useCallback((_, node) => openInEditor(node.data.uri), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      colorMode="system"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-background" nodeStrokeWidth={2} />

      <Panel position="top-right">
        <Button variant="outline" size="sm" onClick={() => void fitView({ padding: 0.15, duration: 200 })}>
          <Maximize /> Fit
        </Button>
      </Panel>

      <Panel
        position="bottom-left"
        className="!ml-14 grid grid-cols-3 gap-x-4 gap-y-1.5 rounded-lg border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
      >
        {LEGEND.map((v) => (
          <LegendItem key={v} variant={v} />
        ))}
      </Panel>
    </ReactFlow>
  );
}
