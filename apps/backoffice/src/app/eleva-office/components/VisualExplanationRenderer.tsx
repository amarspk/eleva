'use client';

import React from 'react';

export type VisualExplanationType = 'architecture_diagram' | 'workflow' | 'process_flow' | 'chart';

export interface VisualExplanationInput {
  type: VisualExplanationType;
  description: string;
  inputs: string[];
  outputs: string[];
  nodes?: Array<{ id: string; label: string; detail?: string }>;
  edges?: Array<{ from: string; to: string; label?: string }>;
}

export interface VisualExplanationProps {
  explanation: VisualExplanationInput;
}

function WorkflowDiagram({ explanation }: { explanation: VisualExplanationInput }): React.ReactElement {
  const nodes = explanation.nodes?.length
    ? explanation.nodes
    : [
        { id: 'input', label: 'Input' },
        { id: 'process', label: 'Process' },
        { id: 'output', label: 'Output' },
      ];
  const edges = explanation.edges?.length
    ? explanation.edges
    : [
        { from: 'input', to: 'process', label: 'request' },
        { from: 'process', to: 'output', label: explanation.outputs[0] || 'result' },
      ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-500">Inputs</div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-gray-700">
            {explanation.inputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-semibold text-blue-700">Workflow</div>
          <div className="mt-2 space-y-2">
            {nodes.map((node) => (
              <div key={node.id} className="rounded border border-blue-100 bg-white p-2">
                <div className="text-sm font-medium text-gray-900">{node.label}</div>
                {node.detail ? <div className="text-xs text-gray-600">{node.detail}</div> : null}
              </div>
            ))}
            <div className="flex flex-col gap-1 pl-2 text-xs text-blue-800">
              {edges.map((edge) => (
                <div key={`${edge.from}-${edge.to}`}>
                  {edge.label ? `${edge.label}: ` : ''}
                  {edge.from} → {edge.to}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-500">Outputs</div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-gray-700">
            {explanation.outputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-gray-500">{explanation.description}</p>
    </div>
  );
}

function ArchitectureDiagram({ explanation }: { explanation: VisualExplanationInput }): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <div className="rounded border border-gray-200 bg-white px-3 py-2">Environment</div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2">Executive Office</div>
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2">ELEVA</div>
      </div>
      <p className="text-xs text-gray-500">{explanation.description}</p>
    </div>
  );
}

function ProcessFlow({ explanation }: { explanation: VisualExplanationInput }): React.ReactElement {
  const steps = [
    'Receive request',
    'Classify intent',
    'Retrieve context',
    'Analyze options',
    'Assess risks',
    'Recommend outcome',
    'Present decision',
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            <div className="rounded border border-gray-200 bg-white px-3 py-2">{step}</div>
            {index < steps.length - 1 ? <div className="text-gray-400">→</div> : null}
          </React.Fragment>
        ))}
      </div>
      <p className="text-xs text-gray-500">{explanation.description}</p>
    </div>
  );
}

function ChartPlaceholder({ explanation }: { explanation: VisualExplanationInput }): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {explanation.inputs.map((label) => (
          <div key={label} className="rounded border border-gray-200 bg-white p-3 text-center">
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">{explanation.description}</p>
    </div>
  );
}

export function VisualExplanationRenderer({ explanation }: VisualExplanationProps): React.ReactElement {
  const type = explanation.type ?? 'workflow';

  if (type === 'architecture_diagram') {
    return <ArchitectureDiagram explanation={explanation} />;
  }

  if (type === 'process_flow') {
    return <ProcessFlow explanation={explanation} />;
  }

  if (type === 'chart') {
    return <ChartPlaceholder explanation={explanation} />;
  }

  return <WorkflowDiagram explanation={explanation} />;
}
