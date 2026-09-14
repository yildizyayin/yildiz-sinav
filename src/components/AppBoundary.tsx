import { Component, type ReactNode } from 'react';

export class AppBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if(this.state.failed) return <main className="entry-faq" role="alert"><h1>Sayfa yüklenemedi</h1><p>Bağlantı kesilmiş veya uygulama güncellenmiş olabilir. Yeniden yükleyerek devam edebilirsiniz.</p><button className="primary large" onClick={()=>window.location.reload()}>Sayfayı yeniden yükle</button><nav className="entry-links"><a href="https://anunex.com">Ana sayfa</a><a href="https://sonuc.anunex.com">Sınav sonuçları</a></nav></main>;
    return this.props.children;
  }
}
