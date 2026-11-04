import ProjectEditor from '@/components/ProjectEditor'
export default async function Page({params}:{params:Promise<{id:string}>}){return <ProjectEditor id={(await params).id} aiAvailable={Boolean(process.env.OPENAI_API_KEY?.trim())}/>}
