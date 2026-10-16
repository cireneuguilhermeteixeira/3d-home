import { readFileSync } from 'node:fs'
import { loadEnvConfig } from '@next/env'
import postgres from 'postgres'
loadEnvConfig(process.cwd())
const url=process.env.DATABASE_URL
if(!url) throw new Error('DATABASE_URL ausente')
async function main(){const sql=postgres(url!,{max:1});try{await sql.unsafe(readFileSync('db/schema.sql','utf8'));console.log('Migração concluída')}finally{await sql.end()}}
main().catch(error=>{console.error(error);process.exitCode=1})
