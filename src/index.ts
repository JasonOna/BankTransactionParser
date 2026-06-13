import { loadConfig } from './config';
import { initLogger, getLogger } from './utils/logger';
import { SyncEngine } from './core/syncEngine';

/**
 * Main entry point for the YNAB transaction sync
 */
async function main() {
  try {
    // Load configuration
    const config = loadConfig();
    const logger = initLogger(config.logLevel);

    logger.info('🚀 Starting YNAB transaction sync');
    logger.info({
      budget: config.ynabBudgetId,
      bankFile: config.bankCsvPath,
      creditCardFile: config.creditCardCsvPath,
      daysBack: config.daysBack,
    }, 'Configuration loaded');

    // Create and run sync engine
    const engine = new SyncEngine(config);
    const report = await engine.sync();

    // Print summary
    console.log('\n📊 Sync Report:');
    console.log(`Total Processed: ${report.totalProcessed}`);
    console.log(`✅ Successful: ${report.successful}`);
    console.log(`⏭️  Skipped (Duplicates): ${report.skipped}`);
    console.log(`❌ Failed: ${report.failed}`);

    if (report.errors.length > 0) {
      console.log('\nErrors:');
      report.errors.forEach(err => {
        console.log(`  - ${err.transaction.payee} [${err.transaction.merchant}] (${err.transaction.date}): ${err.error}`);
      });
    }

    // Exit with appropriate code
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    const logger = getLogger();
    logger.error({ error }, 'Fatal error');
    console.error('❌ Sync failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
