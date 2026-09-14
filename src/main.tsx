import { StrictMode, Suspense } from 'react';
import { AppBoundary } from './components/AppBoundary';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import './styles.css';
import './report-print.css';
import './camera-test.css';
import './expansion.css';
import './panel-system.css';
import './student-enhancements.css';
import './operations-ui.css';
import './exam-builder.css';
import './exam-builder-reference.css';
import './campaign-ui.css';
import './brand-lock.css';
import './profession-targets.css';
import './entry-improvements.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AppBoundary><BrowserRouter><AuthProvider><Suspense fallback={<div className="boot" role="status">Sayfa hazırlanıyor…</div>}><App/></Suspense></AuthProvider></BrowserRouter></AppBoundary></StrictMode>);

if('serviceWorker' in navigator&&import.meta.env.PROD){
 window.addEventListener('load',()=>{void navigator.serviceWorker.register('/service-worker.js').catch(error=>console.error('PWA service worker registration failed',error))});
}
