import type {AuthUser,Env} from '../types';
import {one} from './db';

export type CohortClassScope={id:string;seasonId:string;academicYear:string};
/** A missing scope never grants guidance access to the whole institution. */
export async function cohortReportClassScope(env:Env,user:AuthUser,selection:any):Promise<CohortClassScope|undefined>{
 if(user.role!=='GUIDANCE_TEACHER')return undefined;
 if(!user.institution_id||selection.institutionId!==user.institution_id||typeof selection.classId!=='string'||!selection.classId)return undefined;
 const row=await one<any>(env.DB.prepare(`SELECT c.id,c.season_id seasonId,se.academic_year academicYear FROM classes c JOIN institution_seasons se ON se.id=c.season_id AND se.institution_id=c.institution_id AND se.status='ACTIVE' JOIN institutions i ON i.id=c.institution_id AND i.status='ACTIVE' WHERE c.id=? AND c.institution_id=? AND c.active=1 AND se.academic_year=? ${selection.seasonId?'AND c.season_id=?':''} AND EXISTS(SELECT 1 FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=c.institution_id AND ta.class_id=c.id AND ta.season_id=c.season_id AND ta.assignment_type='GUIDANCE' AND ta.active=1)`).bind(selection.classId,user.institution_id,selection.academicYear,...(selection.seasonId?[selection.seasonId]:[]),user.id));
 if(!row)return undefined;
 // Bind the first request to the resolved season; stored jobs must keep this exact season.
 if(!selection.seasonId)selection.seasonId=row.seasonId;
 return row;
}
