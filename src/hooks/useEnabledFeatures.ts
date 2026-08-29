import {useEffect,useState} from 'react';
import {api} from '../api';
import {useAuth} from '../auth';

export function useEnabledFeatures(){
 const{user}=useAuth();
 const[features,setFeatures]=useState<Set<string>>(new Set());
 const[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);void api<any>('/api/platform/features').then(r=>{if(active)setFeatures(new Set((r.features||[]).filter((row:any)=>user?.role==='SUPER_ADMIN'||Number(row.effective_enabled??row.enabled_default??0)===1).map((row:any)=>String(row.feature_key))))}).catch(()=>active&&setFeatures(new Set())).finally(()=>active&&setLoading(false));return()=>{active=false}},[user?.id,user?.role]);
 return{features,enabled:(key:string)=>features.has(key),loading};
}
