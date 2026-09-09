import {VOICE_INSTRUCTIONS,VOICE_TOOLS} from './voice-client.mjs';
export function voiceSession(){return {
 type:'realtime',model:'gpt-realtime',output_modalities:['audio'],
 instructions:VOICE_INSTRUCTIONS,
 include:['item.input_audio_transcription.logprobs'],
 audio:{input:{noise_reduction:{type:'near_field'},transcription:{model:'gpt-4o-transcribe',language:'en',prompt:'Architectural design conversation. SILTAdesign, Astra, courtyard, facade, roof, floor plan, Jugendstil, Kalasatama. Transcribe only spoken words.'},turn_detection:{type:'server_vad',threshold:.7,prefix_padding_ms:350,silence_duration_ms:550,create_response:false,interrupt_response:true}},output:{voice:'marin'}},
 tools:VOICE_TOOLS,tool_choice:'auto',max_output_tokens:600
};}
export async function createVoiceCall(sdp,key,request=fetch){
 if(!key)throw Error('Connect an OpenAI API key on the display first.');
 const body=new FormData();body.set('sdp',sdp);body.set('session',JSON.stringify(voiceSession()));
 let r;
 try{r=await request('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${key}`},body,signal:AbortSignal.timeout(30000)});}
 catch(e){const code=e.cause?.code;if(['EACCES','EPERM'].includes(code))throw Error('The local voice server cannot reach OpenAI because network access is blocked. Restart the server with network access.');if(code==='ENOTFOUND')throw Error('The local voice server cannot resolve OpenAI. Check the computer’s internet connection.');throw Error('Could not connect the local voice server to OpenAI. '+(code?`Network error: ${code}.`:e.message));}
 if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error?.message||`Voice connection failed (${r.status}).`);}
 return r.text();
}
