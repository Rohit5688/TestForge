#!/usr/bin/env node
/**
 * Test script to verify TestForge improvements
 * Run: node test-fixes.js
 */

const { spawn } = require('child_process');
const path = require('path');

const GOLD_PROJECT = '/Users/rsakhawalkar/Gold-automation/Gold-team-test-automation';
const TESTFORGE_SERVER = '/Users/rsakhawalkar/tetforge/TestForge/dist/index.js';

// Simple MCP client to test tools
async function testTool(toolName, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [TESTFORGE_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    server.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send initialize
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    // Send tool call
    const toolRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    setTimeout(() => {
      server.stdin.write(JSON.stringify(toolRequest) + '\n');
    }, 100);

    setTimeout(() => {
      server.kill();
      resolve({ stdout, stderr });
    }, 2000);
  });
}

async function runTests() {
  console.log('🧪 Testing TestForge Improvements\n');

  // Test 1: get_project_contract reads customWrapper from mcp-config.json
  console.log('Test 1: get_project_contract customWrapper reading');
  console.log('Expected: Should show @ecs-na/trifecta-framework, not vasu-playwright-utils');
  const contractResult = await testTool('get_project_contract', {
    projectRoot: GOLD_PROJECT
  });
  
  if (contractResult.stdout.includes('@ecs-na/trifecta-framework')) {
    console.log('✅ PASS: Correct customWrapper detected\n');
  } else if (contractResult.stdout.includes('vasu-playwright-utils')) {
    console.log('❌ FAIL: Still showing vasu-playwright-utils\n');
  } else {
    console.log('⚠️  Unable to parse result\n');
  }

  console.log('All tests completed!');
}

runTests().catch(console.error);