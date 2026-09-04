import { ANUNEX_BRAND } from '../brand';
import './AnunexBrand.css';

type AnunexBrandProps={
  compact?:boolean;
  inverse?:boolean;
  className?:string;
  tagline?:boolean;
};

export function AnunexSymbol({className=''}:{className?:string}){
  return <svg className={`anunex-symbol-canonical ${className}`.trim()} viewBox="0 0 72 72" role="img" aria-label={ANUNEX_BRAND.name}>
    <defs>
      <linearGradient id="anunex-a-left" x1="8" y1="62" x2="42" y2="5" gradientUnits="userSpaceOnUse"><stop stopColor="#6ca8ff"/><stop offset=".52" stopColor="#2867e8"/><stop offset="1" stopColor="#123a9e"/></linearGradient>
      <linearGradient id="anunex-a-right" x1="60" y1="61" x2="35" y2="10" gradientUnits="userSpaceOnUse"><stop stopColor="#07194b"/><stop offset=".48" stopColor="#0b2a75"/><stop offset="1" stopColor="#174ebf"/></linearGradient>
    </defs>
    <path d="M6 61 28.7 9.6C30.1 6.4 32.4 4.8 36 4.8h5.9L25.4 45.2l-5.9 15.8H6Z" fill="url(#anunex-a-left)"/>
    <path d="M39.2 5.1 66 61H48.2L34.9 31.8l8.4-20.4-4.1-6.3Z" fill="url(#anunex-a-right)"/>
    <path d="M23.7 49.4h28.7l6 11.6H19.2l4.5-11.6Z" fill="#163f9f" opacity=".96"/>
    <path d="M31 34.6h11.1l5.1 10.8H26.5L31 34.6Z" fill="#eef5ff"/>
  </svg>;
}

export function AnunexBrand({compact=false,inverse=false,className='',tagline=true}:AnunexBrandProps){
  return <span className={`anunex-brand-canonical ${inverse?'is-inverse':''} ${compact?'is-compact':''} ${className}`.trim()} aria-label={`${ANUNEX_BRAND.name} — ${ANUNEX_BRAND.ariaTagline}`}>
    <AnunexSymbol/>
    <span className="anunex-wordmark-canonical"><strong>{ANUNEX_BRAND.name}</strong>{tagline&&<small>{ANUNEX_BRAND.tagline}</small>}</span>
  </span>;
}
