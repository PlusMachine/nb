"use client";
import { useState } from "react";
import { RaptIntegrationCard } from "@/features/device-streams/components/rapt-integration-card";
import { SessionTempCorridorControl } from "@/features/device-streams/components/session-temp-corridor-control";
import { useToast } from "@nb/ui";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";
import type { LeaseStatus } from "@/features/brew-controller/control-lease";
export default function CopyLayoutQa() {
 const [requested,setRequested]=useState(false);
 const {show}=useToast();
 const lease:LeaseStatus={held:true,heldByMe:false,holderSessionId:"qa-only",expiresAt:null,takeoverRequested:false,takeoverByMe:requested};
 return <main className="mx-auto max-w-5xl space-y-6 p-4"><h1>Проверка статусов управления</h1>
 <section className="rounded-xl border p-4"><ControlLeaseBadge hasDevice lease={lease} onRelease={()=>{}} onRequestTakeover={()=>setRequested(true)}/></section>
 <section className="rounded-xl border p-4"><ControlLeaseBadge hasDevice lease={{...lease,heldByMe:true,takeoverRequested:true}} onRelease={()=>setRequested(false)} onRequestTakeover={()=>{}}/></section>
 <section className="rounded-xl border p-4"><ControlLeaseBadge hasDevice lease={null} onRelease={()=>{}} onRequestTakeover={()=>{}}/></section>
 <RaptIntegrationCard integration={{id:"qa-only",userId:"qa-only",webhookUrl:null,payloadTemplate:"",createdAt:new Date(0)}} deviceCount={2} onIntegrationChange={()=>{}} onDeleted={()=>{}}/>
 <SessionTempCorridorControl sessionId="qa-only" tempMinC={18} tempMaxC={22} alertsMuted={false}/>
 <button onClick={()=>show({title:"Список покупок изменился. Обновите его и снова выберите, что перенести на склад.",tone:"danger"})}>Показать длинное уведомление</button>
 </main>;
}
