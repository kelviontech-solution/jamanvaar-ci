import { useState } from 'react';
import type { RestaurantBusinessHours, RestaurantHoursInterval } from '../../../../../../packages/ui/src/restaurant-page/types';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function RestaurantHoursEditor({
  value,
  onChange
}: {
  value: RestaurantBusinessHours | null | undefined;
  onChange: (value: RestaurantBusinessHours | null) => void;
}) {
  const [exceptionDate, setExceptionDate] = useState('');
  const intervals = (rows: RestaurantHoursInterval[], label: string, change: (rows: RestaurantHoursInterval[]) => void) => (
    <div className="qpb-hours-intervals">
      {rows.map((row, index) => (
        <div key={index}>
          <label>
            {label} opens {index + 1}
            <input
              aria-label={`${label} opens ${index + 1}`}
              type="time"
              value={row.start}
              onChange={(event) => change(rows.map((v, i) => (i === index ? { ...v, start: event.target.value } : v)))}
            />
          </label>
          <label>
            {label} closes {index + 1}
            <input
              aria-label={`${label} closes ${index + 1}`}
              type="time"
              value={row.end}
              onChange={(event) => change(rows.map((v, i) => (i === index ? { ...v, end: event.target.value } : v)))}
            />
          </label>
          <button type="button" aria-label={`Remove ${label} hours ${index + 1}`} onClick={() => change(rows.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      {rows.length > 0 && rows.length < 4 && (
        <button type="button" onClick={() => change([...rows, { start: '', end: '' }])}>
          + Add a split shift
        </button>
      )}
    </div>
  );
  return (
    <section className="qpb-hours-editor" aria-label="Physical restaurant opening hours">
      <h3>Opening status & holiday hours</h3>
      <p className="qpb-help">
        Optional. Set physical opening hours to show an accurate Open now / Closed badge. These hours do not pause online ordering; ordering hours stay in
        Ordering Rules.
      </p>
      <label>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, weekly: days.map((_, day) => ({ day, intervals: [] })), exceptions: [] }
                : null
            )
          }
        />{' '}
        Show opening status from structured hours
      </label>
      {value && (
        <>
          <label>
            Restaurant timezone
            <input
              aria-label="Restaurant timezone"
              value={value.timezone}
              placeholder="Asia/Kolkata"
              onChange={(event) => onChange({ ...value, timezone: event.target.value })}
            />
          </label>
          <p className="qpb-help">
            Check the restaurant timezone before publishing. Closed days have no shifts. A closing time earlier than opening means the next day. All days start
            closed until you enter hours.
          </p>
          <button
            type="button"
            disabled={
              !value.weekly.find((row) => row.day === 1)?.intervals.every((row) => row.start && row.end) ||
              !value.weekly.find((row) => row.day === 1)?.intervals.length
            }
            onClick={() =>
              onChange({
                ...value,
                weekly: value.weekly.map((row) => ({ ...row, intervals: value.weekly.find((v) => v.day === 1)!.intervals.map((v) => ({ ...v })) }))
              })
            }
          >
            Copy Monday hours to all days
          </button>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const row = value.weekly.find((v) => v.day === day)!;
            const change = (rows: RestaurantHoursInterval[]) =>
              onChange({ ...value, weekly: value.weekly.map((v) => (v.day === day ? { ...v, intervals: rows } : v)) });
            return (
              <div className="qpb-hours-day" key={day}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Open on ${days[day]}`}
                    checked={!!row.intervals.length}
                    onChange={(event) => change(event.target.checked ? [{ start: '', end: '' }] : [])}
                  />
                  {days[day]} {!row.intervals.length && <small>Closed</small>}
                </label>
                {intervals(row.intervals, days[day], change)}
              </div>
            );
          })}
          <h3>Holiday & special-date exceptions</h3>
          <p className="qpb-help">An exception replaces that date’s normal hours. Closed all day also cancels a previous night’s carry-over.</p>
          <div className="qpb-hours-add">
            <label>
              Special date
              <input aria-label="Special opening date" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
            </label>
            <button
              type="button"
              disabled={!exceptionDate || value.exceptions.length >= 40 || value.exceptions.some((row) => row.date === exceptionDate)}
              onClick={() => {
                onChange({ ...value, exceptions: [...value.exceptions, { date: exceptionDate, intervals: [] }] });
                setExceptionDate('');
              }}
            >
              Add date
            </button>
          </div>
          {value.exceptions.map((row) => (
            <div className="qpb-hours-day" key={row.date}>
              <strong>{row.date}</strong>
              <label>
                Opening on {row.date}
                <select
                  value={row.intervals.length ? 'CUSTOM' : 'CLOSED'}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      exceptions: value.exceptions.map((v) =>
                        v.date === row.date ? { ...v, intervals: event.target.value === 'CUSTOM' ? [{ start: '', end: '' }] : [] } : v
                      )
                    })
                  }
                >
                  <option value="CLOSED">Closed all day</option>
                  <option value="CUSTOM">Special opening hours</option>
                </select>
              </label>
              {intervals(row.intervals, row.date, (rows) =>
                onChange({ ...value, exceptions: value.exceptions.map((v) => (v.date === row.date ? { ...v, intervals: rows } : v)) })
              )}
              <button type="button" onClick={() => onChange({ ...value, exceptions: value.exceptions.filter((v) => v.date !== row.date) })}>
                Remove exception
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
