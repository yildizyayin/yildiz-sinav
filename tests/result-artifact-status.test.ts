import {expect,it} from 'vitest';
import {artifactVerificationPassed,artifactJobStatus,artifactErrorText} from '../src/lib/result-artifact-status';
it('shows a passed verification only for a complete current publication certificate',()=>{
 const row={status:'VERIFIED',certificate_current:1,snapshot_version:2,expected_count:51,verified_count:51};
 expect(artifactVerificationPassed(row,2)).toBe(true);
 for(const variant of [{...row,certificate_current:0},{...row,snapshot_version:1},{...row,status:'VERIFYING'},{...row,verified_count:50},{...row,expected_count:0,verified_count:0}])expect(artifactVerificationPassed(variant,2)).toBe(false);
});
it('does not present prepared jobs or finished queue transport as a verified student cohort',()=>{
 expect(artifactJobStatus('PREPARED','preparation')).toBe('Hazırlama turu tamamlandı');
 expect(artifactJobStatus('DONE','queue')).toBe('Bu kuyruk turu tamamlandı');
 expect(artifactJobStatus('INVALIDATED','verification')).toBe('Yeniden denetim gerekiyor');
 expect(artifactErrorText('provider-secret private-details')).toBe('İşlem durumu yeniden kontrol edilmeli.');
});
