export const voiceModel=process.env.REALTIME_MODEL||'gpt-realtime';
export const voiceSession=mode=>({
 type:'realtime',model:voiceModel,output_modalities:['audio'],
 instructions:`You are a concise live voice partner controlling ${mode==='studio'?'Blender':'Excalidraw'} with the user. Their iPhone points at the actual workspace. Use edit_workspace for every request to inspect or edit it; the tool delegates to GPT-6 Astra and includes live pointer/selection context. Preserve the user's words and references such as this or here. Never claim an edit before a successful tool result. When the user corrects direction, call edit_workspace with the correction. Keep spoken responses to one short sentence.`,
 audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},turn_detection:{type:'server_vad',threshold:0.5,prefix_padding_ms:300,silence_duration_ms:500,create_response:true,interrupt_response:true}},output:{voice:'marin'}},
 tools:[{type:'function',name:'edit_workspace',description:'Ask Astra to inspect or edit the actual scene using the live phone pointer and current selection.',parameters:{type:'object',properties:{request:{type:'string'}},required:['request'],additionalProperties:false}},{type:'function',name:'stop_edit',description:'Stop the current Astra edit.',parameters:{type:'object',properties:{},additionalProperties:false}}],tool_choice:'auto',max_output_tokens:600,
});
export async function createVoiceCall(sdp,mode){
 if(!process.env.OPENAI_API_KEY)throw Error('OpenAI key is not connected');
 const body=new FormData();body.set('sdp',sdp);body.set('session',JSON.stringify(voiceSession(mode)));
 const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body,signal:AbortSignal.timeout(30000)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(String(error.error?.message||`Realtime returned ${response.status}`).replace(/sk-[A-Za-z0-9_.*-]+/g,'[redacted key]'))}
 return response.text();
}
