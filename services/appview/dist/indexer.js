console.log('Indexer starting');
async function main() {
    try {
        // Placeholder: keep process alive and pretend to index
        setInterval(() => {
            console.log('Indexer heartbeat');
        }, 30000);
    }
    catch (err) {
        console.error('Indexer error', err);
        process.exit(1);
    }
}
main();
export {};
