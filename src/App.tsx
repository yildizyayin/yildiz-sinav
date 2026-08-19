import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Institutions } from './pages/Institutions';
import { Exams } from './pages/Exams';
import { ExamEvaluate } from './pages/ExamEvaluate';
import { Students } from './pages/Students';
import { Classes } from './pages/Classes';
import { Outcomes } from './pages/Outcomes';
import { Worksheets } from './pages/Worksheets';
import { Reports } from './pages/Reports';
import { Children } from './pages/Children';
import { Transfers } from './pages/Transfers';
import { OpticalPrepare } from './pages/OpticalPrepare';
import { Calibration } from './pages/Calibration';
import { Opticals } from './pages/Opticals';

export default function App(){
 const {user,loading}=useAuth(); const location=useLocation();
 if(loading)return <div className="boot">Ölçme Platformu yükleniyor…</div>;
 if(!user&&location.pathname!=='/login')return <Navigate to="/login" replace/>;
 if(user&&location.pathname==='/login')return <Navigate to="/" replace/>;
 return <Routes>
  <Route path="/login" element={<Login/>}/>
  <Route element={<Layout/>}>
   <Route index element={<Dashboard/>}/>
   <Route path="institutions" element={<Institutions/>}/>
   <Route path="exams" element={<Exams/>}/>
   <Route path="exams/:examId/evaluate" element={<ExamEvaluate/>}/>
   <Route path="students" element={<Students/>}/>
   <Route path="classes" element={<Classes/>}/>
   <Route path="outcomes" element={<Outcomes/>}/>
   <Route path="worksheets" element={<Worksheets/>}/>
   <Route path="reports" element={<Reports/>}/>
   <Route path="my-results" element={<Reports/>}/>
   <Route path="children" element={<Children/>}/>
   <Route path="transfers" element={<Transfers/>}/>
   <Route path="optical-prepare" element={<OpticalPrepare/>}/>
   <Route path="calibration" element={<Calibration/>}/>
   <Route path="opticals" element={<Opticals/>}/>
   <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route>
 </Routes>
}
