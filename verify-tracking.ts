import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verify() {
    console.log("Verifying AI Track History...");
    
    // Check if we have any records in HistoricalSetup
    const count = await prisma.historicalSetup.count();
    console.log(`Total records in HistoricalSetup: ${count}`);
    
    // Check for different signal types
    const buyCount = await prisma.historicalSetup.count({ where: { aiSignal: 'BUY' } });
    const lightBuyCount = await prisma.historicalSetup.count({ where: { aiSignal: 'LIGHT BUY' } });
    const watchCount = await prisma.historicalSetup.count({ where: { aiSignal: 'WATCH' } });
    
    console.log(`BUY count: ${buyCount}`);
    console.log(`LIGHT BUY count: ${lightBuyCount}`);
    console.log(`WATCH count: ${watchCount}`);
    
    // Check if aiLogic is being saved
    const withLogic = await prisma.historicalSetup.findFirst({
        where: { aiLogic: { not: null } }
    });
    
    if (withLogic) {
        console.log(`Found record with aiLogic: ${withLogic.ticker}`);
        console.log(`Logic snippet: ${withLogic.aiLogic?.substring(0, 100)}...`);
    } else {
        console.log("No records found with aiLogic yet.");
    }
    
    await prisma.$disconnect();
}

verify();
