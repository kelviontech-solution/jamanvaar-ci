import { useState } from 'react';
type Step = 'MENU' | 'REVIEW' | 'KITCHEN' | 'READY' | 'SERVED' | 'PAYMENT' | 'RECEIPT';
/** In-memory simulator. No repository, fetch, gateway, stock or print dependencies. */
export function FullTrainingSandbox() {
  const [step, setStep] = useState<Step>('MENU'),
    [quantity, setQuantity] = useState(1),
    [extra, setExtra] = useState(false),
    [discount, setDiscount] = useState(0),
    [method, setMethod] = useState('Cash'),
    [failed, setFailed] = useState(false),
    [history, setHistory] = useState<string[]>([]);
  const gross = (100 + (extra ? 20 : 0)) * quantity,
    total = Math.round(gross * (1 - discount / 100) * 100) / 100;
  const move = (next: Step, event: string) => {
    setHistory((h) => [...h, event]);
    setStep(next);
  };
  const button = 'min-h-11 border rounded-xl px-4 py-2 bg-white m-1';
  return (
    <details className="mt-3 border rounded-xl p-3 bg-white">
      <summary className="font-bold cursor-pointer min-h-11">Full service training sandbox</summary>
      <p className="p-2 bg-amber-50 font-bold">
        TRAINING ONLY · No real sales, stock, payments, messages or printing.
      </p>
      <p>Current stage: {step}</p>
      {step === 'MENU' && (
        <>
          <label className="block my-3">
            Practice dish quantity
            <input
              aria-label="Practice dish quantity"
              className="border rounded p-2 ml-2 w-24"
              type="number"
              min="1"
              max="20"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="block my-3">
            <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> Add
            practice modifier (+20 per dish)
          </label>
          <button className={button} onClick={() => move('REVIEW', 'Practice cart created')}>
            Review training cart
          </button>
        </>
      )}
      {step === 'REVIEW' && (
        <>
          <p>
            Practice dish × {quantity}
            {extra ? ' · extra modifier' : ''} · Subtotal {gross.toFixed(2)}
          </p>
          <label className="block my-3">
            Practice discount %
            <input
              aria-label="Practice discount percent"
              className="border rounded p-2 ml-2 w-24"
              type="number"
              min="0"
              max="50"
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
            />
          </label>
          <p>Payable {total.toFixed(2)}</p>
          <button className={button} onClick={() => move('KITCHEN', 'Practice KOT received by kitchen')}>
            Send training order to kitchen
          </button>
        </>
      )}
      {step === 'KITCHEN' && (
        <button className={button} onClick={() => move('READY', 'Practice kitchen marked all dishes ready')}>
          Complete preparation
        </button>
      )}
      {step === 'READY' && (
        <button className={button} onClick={() => move('SERVED', 'Practice order handed to guest')}>
          Mark training order served
        </button>
      )}
      {step === 'SERVED' && (
        <button className={button} onClick={() => move('PAYMENT', 'Practice bill opened for collection')}>
          Collect practice bill
        </button>
      )}
      {step === 'PAYMENT' && (
        <>
          <label className="block my-3">
            Practice payment method
            <select
              className="border rounded p-2 ml-2"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {['Cash', 'UPI simulation', 'Card simulation'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button
            className={button}
            onClick={() => {
              setFailed(true);
              setHistory((h) => [...h, 'Practice payment failed; no collection recorded']);
            }}
          >
            Simulate payment failure
          </button>
          {failed && (
            <p role="alert">Practice payment failed. The bill remains unpaid. Retry the same bill.</p>
          )}
          <button
            className={button}
            onClick={() => {
              setFailed(false);
              move('RECEIPT', 'Practice collection confirmed once via ' + method);
            }}
          >
            {failed ? 'Retry practice payment' : 'Confirm practice payment'}
          </button>
        </>
      )}
      {step === 'RECEIPT' && (
        <div className="border-2 border-dashed rounded-xl p-4">
          <h4 className="font-bold">TRAINING RECEIPT · NOT A TAX INVOICE</h4>
          <p>
            Practice dish × {quantity} · {extra ? 'With modifier' : 'No modifier'}
          </p>
          <p>
            Subtotal {gross.toFixed(2)} · Discount {discount}% · Paid {total.toFixed(2)}
          </p>
          <p>Simulated {method} · No message or print sent</p>
        </div>
      )}
      <details className="my-3">
        <summary>Training timeline</summary>
        <ol>
          {history.map((h, i) => (
            <li key={i}>
              {i + 1}. {h}
            </li>
          ))}
        </ol>
      </details>
      <button
        className={button}
        onClick={() => {
          setStep('MENU');
          setQuantity(1);
          setExtra(false);
          setDiscount(0);
          setMethod('Cash');
          setFailed(false);
          setHistory([]);
        }}
      >
        Reset full simulation
      </button>
    </details>
  );
}
