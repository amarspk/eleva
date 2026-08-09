import { BadRequestException } from '@nestjs/common';
// Unit test for preorder validation logic extracted from OrderService
describe('Preorder 15-min rule', () => {
  function validate(isPreorder:boolean, scheduledAt?:string){
    if (isPreorder && scheduledAt) {
      const sched = new Date(scheduledAt);
      if (isNaN(sched.getTime()) || sched.getTime() <= Date.now() + 15*60*1000) {
        throw new BadRequestException('scheduledAt must be at least 15 minutes in the future');
      }
    }
  }
  it('normal orders pass without scheduledAt', ()=>{ expect(()=>validate(false)).not.toThrow(); });
  it('preorder with future scheduledAt passes', ()=>{ expect(()=>validate(true, new Date(Date.now()+30*60*1000).toISOString())).not.toThrow(); });
  it('preorder too soon throws', ()=>{ expect(()=>validate(true, new Date(Date.now()+5*60*1000).toISOString())).toThrow(BadRequestException); });
  it('preorder with past throws', ()=>{ expect(()=>validate(true, new Date(Date.now()-1000).toISOString())).toThrow(BadRequestException); });
});
