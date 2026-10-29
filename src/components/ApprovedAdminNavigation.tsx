import { useState, type ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, ChartNoAxesCombined, ChevronDown, CircleHelp, ClipboardCheck, FileText, Home, Link2, LogOut, Orbit, Search, Settings, Users, X } from 'lucide-react';

type Item={to:string;label:string;icon:ComponentType<{size?:number}>};
type Props={items:Item[];displayName:string;onNavigate:()=>void;onLogout:()=>Promise<void>};
const groups=[
  {label:'Ölçme ve Sınav',icon:ClipboardCheck,paths:['/exam-center','/exam-definitions','/exams','/opticals','/camera-test','/optical-prepare','/optical-design','/calibration','/exam-channels','/result-network']},
  {label:'İçerik ve Öğrenme',icon:BookOpen,paths:['/content-center','/quick-tests','/question-team','/worksheet-admin','/outcomes','/curriculum','/written-scenarios','/written-rubrics','/written-papers','/official-question-intelligence']},
  {label:'Eğitim Operasyonu',icon:CalendarDays,paths:['/calendar','/worksheet-calendar','/attendance','/transfers','/bulk-operations','/seasons']},
  {label:'Rehberlik ve Analiz',icon:ChartNoAxesCombined,paths:['/guidance-admin','/reports','/academic-target-admin']},
  {label:'Kullanıcılar ve Kurumlar',icon:Users,paths:['/institutions','/students','/users','/activation-requests','/access-accounts','/teacher-assignments','/enterprise','/licenses','/membership-orders']},
  {label:'Nibiru ve Ajanlar',icon:Orbit,paths:['/nibiru','/nibiru-admin','/agent-center']},
  {label:'Sistem Yönetimi',icon:Settings,paths:['/admin-center','/standard-readiness','/theme-management','/settings','/feature-lab','/demo-mode','/scale','/completion-center','/notifications','/profile']},
];
const normalize=(value:string)=>value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');

/** Approved 26 October reference. Local navigation only; no API or permission changes. */
export function ApprovedAdminNavigation({items,displayName,onNavigate,onLogout}:Props){
 const {pathname}=useLocation();
 const [query,setQuery]=useState('');
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const term=normalize(query.trim());
 const active=(to:string)=>to==='/'?pathname==='/':pathname===to||pathname.startsWith(to+'/');
 const homeVisible=!term||normalize('Genel Bakış').includes(term);
 // Every page the Super Admin may open is reachable: sub-items are flattened, and pages no group lists go under "Diğer".
 const flat:Item[]=[];const seen=new Set<string>();const walk=(list:any[])=>{for(const item of list){const to=String(item.to).split('?')[0];if(to!=='/'&&!seen.has(to)){seen.add(to);flat.push({...item,to})}if(item.children)walk(item.children)}};walk(items);
 const listed=new Set(groups.flatMap(group=>group.paths));
 const allGroups=[...groups,{label:'Diğer',icon:FileText,paths:flat.map(item=>item.to).filter(path=>!listed.has(path))}];
 const sections=allGroups.map(group=>({...group,items:group.paths.map(path=>flat.find(item=>item.to===path)).filter((item):item is Item=>Boolean(item)).filter(item=>!term||normalize(group.label).includes(term)||normalize(item.label).includes(term))})).filter(group=>group.items.length);
 const navigate=()=>{setQuery('');onNavigate()};
 return <>
  <label className="approved-menu-search"><Search size={18}/><input aria-label="Menüde ara" placeholder="Menüde ara" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label="Menü aramasını temizle" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
  <nav className="grouped-sidebar-nav approved-menu" aria-label="Süper Admin gezinme">
   {homeVisible&&<NavLink to="/" end className={({isActive})=>`nav-item approved-menu-home ${isActive?'active':''}`} onClick={navigate}><Home size={20}/><span>Genel Bakış</span></NavLink>}
   {sections.map(group=>{
    const Icon=group.icon;const selected=group.items.some(item=>active(item.to));const open=Boolean(term)||(expanded[group.label]??selected);
    return <section className={`nav-group approved-menu-group ${open?'open':''} ${selected?'has-current-page':''}`} key={group.label}>
     <button className="nav-group-toggle" type="button" aria-expanded={open} aria-controls={`approved-group-${allGroups.findIndex(value=>value.label===group.label)}`} onClick={()=>setExpanded(current=>({...current,[group.label]:!open}))}><Icon size={20}/><span>{group.label}</span><ChevronDown className="approved-menu-chevron" size={16}/></button>
     {open&&<div className="nav-group-items" id={`approved-group-${allGroups.findIndex(value=>value.label===group.label)}`}>{group.items.map(item=>{const ItemIcon=item.icon;return <NavLink key={item.to} to={item.to} end={item.to==='/'||item.to==='/exam-center'} onClick={navigate} className={({isActive})=>`nav-item ${isActive?'active':''}`}><ItemIcon size={17}/><span>{item.label}</span></NavLink>})}</div>}
    </section>;
   })}
   {!homeVisible&&!sections.length&&<div className="empty approved-menu-empty" role="status">Eşleşen menü bulunamadı.</div>}
   {!term&&<div className="approved-shortcuts"><div className="approved-shortcuts-title"><Link2 size={20}/><span>Kısayollar</span></div>{['/content-center','/calendar'].map(path=>{const item=items.find(value=>value.to===path);if(!item)return null;const Icon=path==='/content-center'?FileText:item.icon;return <NavLink key={path} to={path} className="nav-item" onClick={navigate}><Icon size={20}/><span>{path==='/content-center'?'Soru Havuzu':'Takvim'}</span></NavLink>})}</div>}
  </nav>
  <div className="sidebar-footer approved-menu-footer">
   <details className="approved-menu-help"><summary><CircleHelp size={20}/><span>Yardım</span></summary><p>Bir bölüme ulaşmak için menüde arama yapabilir veya ilgili başlığı açabilirsiniz. Hesap ve yetki sorunlarında sistem yöneticinizle iletişime geçin.</p></details>
   <details className="approved-menu-account"><summary><span className="avatar">{displayName.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word.charAt(0)).join('')}</span><span title={displayName}>Süper Admin</span><ChevronDown size={16}/></summary><div className="approved-account-actions"><NavLink className="nav-item" to="/profile" onClick={navigate}><Users size={18}/><span>Profil</span></NavLink><button className="ghost sidebar-logout" onClick={onLogout}><LogOut size={18}/>Çıkış</button></div></details>
  </div>
 </>;
}
