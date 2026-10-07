import { Component, Suspense, type ReactNode } from 'react';

class PageErrorBoundary extends Component<{children:ReactNode;routeKey:string},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidUpdate(previous:{routeKey:string}){if(previous.routeKey!==this.props.routeKey&&this.state.failed)this.setState({failed:false})}
 render(){
  if(this.state.failed)return <section className="panel" role="alert"><h2>Sayfa açılamadı</h2><p>Bağlantınızı kontrol edip sayfayı yeniden yükleyin. Sorun sürerse yöneticinizle iletişime geçin.</p><button onClick={()=>window.location.reload()}>Sayfayı yeniden yükle</button></section>;
  return this.props.children;
 }
}

export function PageLoader({children,routeKey}:{children:ReactNode;routeKey:string}){
 return <PageErrorBoundary routeKey={routeKey}><Suspense fallback={<div className="panel" role="status" aria-live="polite">Sayfa yükleniyor…</div>}>{children}</Suspense></PageErrorBoundary>;
}
