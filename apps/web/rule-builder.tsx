import { useState } from 'react';
import { ruleSchema, type Rule, type RuleSource, type Workflow } from '../../packages/shared/contracts';
import { ErrorMessage, Panel } from './ui';

type Operand = {
  source: 'dom' | 'api' | 'literal';
  field: string;
  mode: 'text' | 'string' | 'data-value';
  operation: string;
};
const initial = (source: Operand['source'], field = ''): Operand => ({
  source,
  field,
  mode: 'text',
  operation: '',
});

function operand(input: Operand): RuleSource {
  if (input.source === 'dom') return { from: 'dom', key: input.field.trim(), read: input.mode };
  if (input.source === 'api') {
    const [method, endpoint] = input.operation.trim().split(/\s+/);
    return { from: 'api', method: method as 'GET', endpoint, path: input.field.trim() };
  }
  return { from: 'literal', value: JSON.parse(input.field) };
}

function OperandFields({
  title,
  value,
  update,
}: {
  title: string;
  value: Operand;
  update: (value: Operand) => void;
}) {
  return (
    <fieldset className="mutation-editor">
      <legend>{title}</legend>
      <div className="field-grid">
        <label>
          Source
          <select
            value={value.source}
            onChange={(event) => update(initial(event.target.value as Operand['source']))}
          >
            <option value="dom">DOM element</option>
            <option value="api">Captured API response</option>
            <option value="literal">Independent value</option>
          </select>
        </label>
        {value.source === 'dom' && (
          <label>
            DOM reading
            <select
              value={value.mode}
              onChange={(event) => update({ ...value, mode: event.target.value as Operand['mode'] })}
            >
              <option value="text">Numeric text</option>
              <option value="string">Text</option>
              <option value="data-value">Numeric data-value</option>
            </select>
          </label>
        )}
        {value.source === 'api' && (
          <label>
            Operation
            <input
              required
              placeholder="GET /availability/quiet-lab"
              value={value.operation}
              onChange={(event) => update({ ...value, operation: event.target.value })}
            />
          </label>
        )}
        <label>
          {value.source === 'dom'
            ? 'Element test ID'
            : value.source === 'api'
              ? 'JSON field path'
              : 'JSON scalar value'}
          <input
            required
            placeholder={value.source === 'literal' ? '5, true or "ready"' : undefined}
            value={value.field}
            onChange={(event) => update({ ...value, field: event.target.value })}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function RuleBuilder({ draft, update }: { draft: string; update: (value: string) => void }) {
  const [mode, setMode] = useState('equal');
  const [name, setName] = useState('');
  const [first, setFirst] = useState(initial('dom'));
  const [second, setSecond] = useState(initial('literal', '5'));
  const [third, setThird] = useState(initial('literal', '1'));
  const [discount, setDiscount] = useState(initial('literal', '0'));
  const [lower, setLower] = useState('0');
  const [upper, setUpper] = useState('10');
  const [expected, setExpected] = useState('number');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const compare = ['equal', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(mode);
  return (
    <Panel title="Business rule builder">
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          setSaved(false);
          try {
            const workflow = JSON.parse(draft) as Workflow;
            if (!workflow || !Array.isArray(workflow.steps))
              throw new Error('Open or create a workflow first');
            const id = `rule-${crypto.randomUUID().slice(0, 8)}`;
            const base = { id, name };
            const source = operand(first);
            const candidate = compare
              ? {
                  ...base,
                  op: mode === 'equal' ? 'equal' : 'compare',
                  comparison: mode,
                  left: source,
                  right: operand(second),
                }
              : mode === 'range'
                ? { ...base, op: mode, source, min: Number(lower), max: Number(upper) }
                : mode === 'required' || mode === 'type'
                  ? { ...base, op: mode, source, expected }
                  : {
                      ...base,
                      op: 'sum-products',
                      total: source,
                      terms: [{ price: operand(second), quantity: operand(third) }],
                      subtract: operand(discount),
                    };
            const rule: Rule = ruleSchema.parse(candidate);
            const last = workflow.steps.at(-1);
            if (last?.action === 'rules' && last.rules.length < 10) last.rules.push(rule);
            else workflow.steps.push({ action: 'rules', rules: [rule] });
            update(JSON.stringify(workflow, null, 2));
            setSaved(true);
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <div className="field-grid">
          <label>
            Rule name
            <input
              required
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Operator
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="equal">Equals</option>
              <option value="neq">Does not equal</option>
              <option value="lt">Less than</option>
              <option value="lte">At most</option>
              <option value="gt">Greater than</option>
              <option value="gte">At least</option>
              <option value="range">Numeric range</option>
              <option value="required">Required value</option>
              <option value="type">Data type</option>
              <option value="sum-products">Total equals price × quantity − deduction</option>
            </select>
          </label>
        </div>
        <OperandFields
          title={mode === 'sum-products' ? 'Total' : 'Measured value'}
          value={first}
          update={setFirst}
        />
        {(compare || mode === 'sum-products') && (
          <OperandFields
            title={mode === 'sum-products' ? 'Price' : 'Comparison value'}
            value={second}
            update={setSecond}
          />
        )}
        {mode === 'sum-products' && (
          <>
            <OperandFields title="Quantity" value={third} update={setThird} />
            <OperandFields title="Deduction" value={discount} update={setDiscount} />
          </>
        )}
        {mode === 'range' && (
          <div className="field-grid">
            <label>
              Minimum
              <input
                type="number"
                step="any"
                required
                value={lower}
                onChange={(event) => setLower(event.target.value)}
              />
            </label>
            <label>
              Maximum
              <input
                type="number"
                step="any"
                required
                value={upper}
                onChange={(event) => setUpper(event.target.value)}
              />
            </label>
          </div>
        )}
        {mode === 'type' && (
          <label>
            Expected data type
            <select value={expected} onChange={(event) => setExpected(event.target.value)}>
              {['number', 'string', 'boolean', 'object', 'array', 'null'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        )}
        <button className="button primary">Add rule to workflow</button>
        {saved && (
          <p className="message success" role="status">
            Rule added to the workflow draft.
          </p>
        )}
        {error && <ErrorMessage error={error} />}
      </form>
    </Panel>
  );
}
