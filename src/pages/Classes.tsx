import { useEffect,useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { api } from '../api';

export function Classes(){const[rows,setRows]=useState<any[]>([]);useEffect(()=>{void api<any>('/api/classes').then(r=>setRows(r.classes))},[]);return <><div className="page-head"><div><span className="eyebrow">Yetki filtreli</span><h1>Sınıflarım</h1><p>Branş öğretmeni sadece atanmış sınıf ve branşını; rehber öğretmeni atanmış sınıfın tüm derslerini görür.</p></div></div><div className="cards-list">{rows.map(r=><div className="list-card" key={r.id}><div className="quick-icon"><Users/></div><div><strong>{r.name}</strong><span>{r.student_count} aktif öğrenci</span></div><ChevronRight/></div>)}</div></>}
