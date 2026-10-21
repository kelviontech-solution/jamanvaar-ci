import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { copyChoiceGroup, makeChoiceGroup, type ChoiceGroup } from './menuChoiceDrafts';
import './qr-menu-choices.css';

export function QrMenuChoices({
  selectedIds,
  groups,
  staged,
  onSelect,
  onStage,
  scope
}: {
  selectedIds: string[];
  groups: ChoiceGroup[];
  staged: Record<string, ChoiceGroup>;
  onSelect: (ids: string[]) => void;
  onStage: (group: ChoiceGroup) => void;
  scope: 'dish' | 'category';
}) {
  const id = useId(),
    all = [...groups.filter((group) => !staged[group.id]), ...Object.values(staged)];
  const attach = (group: ChoiceGroup) => {
    onStage(group);
    onSelect([...selectedIds, group.id]);
  };
  const customize = (group: ChoiceGroup) => {
    const copy = copyChoiceGroup(group);
    onStage(copy);
    onSelect(selectedIds.map((old) => (old === group.id ? copy.id : old)));
  };
  return (
    <section className="qr-menu-choices" aria-label={scope === 'category' ? 'Category default choices' : 'Dish sizes and add-ons'}>
      <h4>{scope === 'category' ? 'Default sizes & add-ons' : 'Sizes & add-ons'}</h4>
      <p>
        {scope === 'category'
          ? 'Restaurant-wide defaults: these choices are copied to new dishes in this category. Existing dishes keep their saved choices.'
          : 'Guests see these named choices before adding the dish. Each option adds its extra price to the dish price.'}
      </p>
      <div className="qr-menu-choices-actions">
        <button type="button" onClick={() => attach(makeChoiceGroup('SIZE'))}>
          <Plus size={16} />
          Add sizes
        </button>
        <button type="button" onClick={() => attach(makeChoiceGroup('ADD_ON'))}>
          <Plus size={16} />
          Add add-ons
        </button>
      </div>
      {all.some((group) => !selectedIds.includes(group.id)) && (
        <label className="qr-menu-choices-library">
          Use an existing group
          <select
            aria-label="Use an existing choice group"
            value=""
            onChange={(e) => {
              if (e.target.value) onSelect([...selectedIds, e.target.value]);
            }}
          >
            <option value="">Choose a saved group…</option>
            {all
              .filter((group) => !selectedIds.includes(group.id))
              .map((group) => (
                <option value={group.id} key={group.id}>
                  {group.name} —{' '}
                  {group.options
                    .map((option) => option.name)
                    .slice(0, 4)
                    .join(', ')}
                </option>
              ))}
          </select>
        </label>
      )}
      {!selectedIds.length && (
        <p className="qr-menu-choices-empty">No choices yet. Use Add sizes for Normal / Medium / Large, or Add add-ons to define your own extras.</p>
      )}
      {scope === 'dish' && (
        <p className="qr-menu-choices-help">For reusable category defaults, open Manage categories → Edit category before adding your next dishes.</p>
      )}
      {selectedIds.map((groupId) => {
        const group = all.find((group) => group.id === groupId),
          editable = !!staged[groupId];
        return (
          <fieldset key={groupId} className="qr-menu-choice-group">
            <legend>{group?.name || 'Missing choice group'}</legend>
            <div className="qr-menu-choices-actions">
              {group && !editable && (
                <button type="button" onClick={() => customize(group)}>
                  Customize for this {scope}
                </button>
              )}
              <button type="button" onClick={() => onSelect(selectedIds.filter((id) => id !== groupId))}>
                Remove group
              </button>
            </div>
            {!group ? (
              <p role="alert">This group is unavailable. Remove it before saving.</p>
            ) : !editable ? (
              <>
                <p>
                  {group.isRequired || Number(group.minSelections) > 0 ? 'Required' : 'Optional'} · Choose{' '}
                  {Math.max(Number(group.minSelections) || 0, group.isRequired ? 1 : 0)}–{Number(group.maxSelections) || 'any'}
                </p>
                <ul className="qr-menu-choice-summary">
                  {group.options.map((option) => (
                    <li key={option.id}>
                      {option.name} <strong>+₹{Number(option.priceDelta).toFixed(2)}</strong>
                      {option.isAvailable === false ? ' · Unavailable' : ''}
                    </li>
                  ))}
                </ul>
                <p className="qr-menu-choices-help">
                  This is a saved group. Customize creates a separate copy for this {scope}, preserving choices already used by other dishes.
                </p>
              </>
            ) : (
              <>
                <label>
                  Group name
                  <input maxLength={120} value={group.name} onChange={(e) => onStage({ ...group, name: e.target.value })} />
                </label>
                {group.kind === 'SIZE' ? (
                  <p>Size is required: guests choose exactly one. Rename the sizes and set extra prices below.</p>
                ) : (
                  <div className="qr-menu-choices-limits">
                    <label>
                      Minimum choices
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={group.minSelections}
                        onChange={(e) => onStage({ ...group, minSelections: e.target.value, isRequired: Number(e.target.value) > 0 })}
                      />
                    </label>
                    <label>
                      Maximum choices
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={group.maxSelections}
                        onChange={(e) => onStage({ ...group, maxSelections: e.target.value })}
                      />
                      <small>0 allows any number.</small>
                    </label>
                  </div>
                )}
                <p className="qr-menu-choices-help">
                  Extra price is added to the dish price. For example: dish ₹200 + Medium ₹50 = ₹250 before tax. Set ₹0 for a choice included in the dish price.
                </p>
                {group.options.map((option, index) => (
                  <div className="qr-menu-choice-option" key={option.id}>
                    <label htmlFor={`${id}-${option.id}-name`}>
                      Option {index + 1} name
                      <input
                        id={`${id}-${option.id}-name`}
                        maxLength={120}
                        value={option.name}
                        placeholder={group.kind === 'SIZE' ? 'e.g. Medium' : 'e.g. Extra cheese'}
                        onChange={(e) =>
                          onStage({ ...group, options: group.options.map((old) => (old.id === option.id ? { ...old, name: e.target.value } : old)) })
                        }
                      />
                    </label>
                    <label htmlFor={`${id}-${option.id}-price`}>
                      Extra price (₹)
                      <input
                        id={`${id}-${option.id}-price`}
                        aria-label={`Option ${index + 1} extra price`}
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.01"
                        value={option.priceDelta}
                        onChange={(e) =>
                          onStage({ ...group, options: group.options.map((old) => (old.id === option.id ? { ...old, priceDelta: e.target.value } : old)) })
                        }
                      />
                    </label>
                    <label className="qr-menu-choice-availability">
                      <input
                        type="checkbox"
                        checked={option.isAvailable !== false}
                        onChange={(e) =>
                          onStage({ ...group, options: group.options.map((old) => (old.id === option.id ? { ...old, isAvailable: e.target.checked } : old)) })
                        }
                      />
                      Available
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => onStage({ ...group, options: group.options.filter((old) => old.id !== option.id) })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={group.options.length >= 100}
                  onClick={() =>
                    onStage({
                      ...group,
                      options: [
                        ...group.options,
                        { id: crypto.randomUUID(), groupId, name: '', priceDelta: 0, isAvailable: true, sortOrder: group.options.length }
                      ]
                    })
                  }
                >
                  <Plus size={16} />
                  Add option
                </button>
              </>
            )}
          </fieldset>
        );
      })}
      <p className="qr-menu-choices-help">Choices are saved with this {scope}. Publish the shared menu when ready for customers.</p>
    </section>
  );
}
