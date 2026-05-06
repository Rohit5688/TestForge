import json
from pathlib import Path
from datetime import datetime
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

def run():
    print("Detecting files...")
    detection = detect(Path('.'))
    code_files = []
    for f in detection.get('files', {}).get('code', []):
        path = Path(f)
        
        # Focus strictly on the 'src' directory to avoid noise
        if 'src' not in path.parts:
            continue
            
        # Exclude tests and interfaces to eliminate purely structural or redundant node gaps
        if 'tests' in path.parts or 'interfaces' in path.parts:
            continue
            
        if path.name.endswith('.test.ts') or path.name.endswith('.spec.ts'):
            continue
            
        # Exclude TypeScript declarations to prevent disconnected thin communities
        if path.name.endswith('.d.ts'):
            continue
            
        if path.is_dir():
            collected = [p for p in collect_files(path) if not p.name.endswith('.d.ts')]
            code_files.extend(collected)
        else:
            code_files.append(path)
            
    print(f"Extracting AST for {len(code_files)} code files...")
    ext_result = extract(code_files)
    extraction = {
        'nodes': ext_result['nodes'],
        'edges': ext_result['edges'],
        'input_tokens': 0, 'output_tokens': 0
    }
    
    print("Building knowledge graph...")
    G = build_from_json(extraction)
    if G.number_of_nodes() == 0:
        print("Graph is empty!")
        return

    print("Clustering communities...")
    communities = cluster(G)
    cohesion = score_all(G, communities)
    
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    labels = {cid: f'Community {cid}' for cid in communities}
    questions = suggest_questions(G, communities, labels)
    
    print("Generating reports and interactive UI...")
    out_dir = Path('graphify-out')
    out_dir.mkdir(exist_ok=True)
    
    tokens = {'input': 0, 'output': 0}
    report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '.', suggested_questions=questions)
    
    (out_dir / 'GRAPH_REPORT.md').write_text(report, encoding="utf-8")
    to_json(G, communities, str(out_dir / 'graph.json'))
    
    # Save the custom "Structural Brain" for AI awareness
    project_name = Path('.').resolve().name
    brain_dir = Path(f'.{project_name}')
    brain_dir.mkdir(exist_ok=True)
    brain_data = {
        'project': project_name,
        'analyzed_at': datetime.now().isoformat() if hasattr(datetime.now(), 'isoformat') else datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        'godNodes': gods,
        'surprising_connections': surprises,
        'suggested_questions': questions,
        'communities': {str(cid): members for cid, members in communities.items()},
        'cohesion': cohesion
    }
    with open(brain_dir / 'structural-brain.json', 'w') as f:
        json.dump(brain_data, f, indent=2)
    
    if G.number_of_nodes() < 5000:
        to_html(G, communities, str(out_dir / 'graph.html'), community_labels=labels)
        
    print(f"Graph complete: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities.")
    print("Results saved in graphify-out/")

if __name__ == '__main__':
    run()
