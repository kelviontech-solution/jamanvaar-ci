import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class OrderingBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  componentDidCatch(error: Error) {console.error('QR ordering could not render',error);}
  render(){return this.state.failed ? <main className="center"><h1>Ordering could not load</h1><p>Please try again or ask a team member.</p><button className="primary" onClick={()=>location.reload()}>Try again</button></main> : this.props.children;}
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OrderingBoundary><App /></OrderingBoundary>
  </StrictMode>
);
