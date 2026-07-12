#!/usr/bin/env python3
"""
Minimal CLI demo of the BIPIA indirect prompt injection pipeline
(https://github.com/microsoft/BIPIA).

Shows how three pieces are assembled into a single prompt that gets
sent to an LLM:
  1. a system prompt (the task instruction)
  2. external content (e.g. an email or resume) that may hide an
     attacker's instruction inside it
  3. the user's actual query

No target model is called here -- this just prints the exact text that
would be sent as the model's input, so you can see how an indirect
prompt injection attack hides inside "data" the model treats as
context. A real ML guardrail then scans that content before it would
reach the target model.
"""

import argparse

import scenarios


def main():
    parser = argparse.ArgumentParser(
        description="Demo: how indirect prompt injection hides inside "
        "model input (BIPIA-style)."
    )
    parser.add_argument(
        "--scenario",
        choices=sorted(scenarios.SCENARIOS),
        default="email",
        help="Which scenario to run.",
    )
    parser.add_argument(
        "--query",
        default=None,
        help="Override the scenario's default question.",
    )
    parser.add_argument(
        "--no-attack",
        action="store_true",
        help="Build the prompt with clean content (no injected instruction).",
    )
    parser.add_argument(
        "--defense",
        action="store_true",
        help="Apply a simple border-string defense around the external content.",
    )
    parser.add_argument(
        "--no-guardrail",
        action="store_true",
        help="Skip the ML guardrail scan (faster, no model load).",
    )
    parser.add_argument(
        "--cv-file",
        default=None,
        help="Path to a real PDF resume/CV to scan instead of the built-in "
        "sample (only valid with --scenario resume).",
    )
    args = parser.parse_args()

    if args.cv_file and args.scenario != "resume":
        parser.error("--cv-file is only valid with --scenario resume")

    scenario = scenarios.SCENARIOS[args.scenario]
    query = args.query if args.query is not None else scenario.default_query

    if args.cv_file:
        with open(args.cv_file, "rb") as f:
            content = scenarios.extract_pdf_text(f.read())
    else:
        inject_attack = not args.no_attack
        content = scenario.get_content(inject_attack)

    prompt = scenarios.build_prompt(query, content, args.defense, scenario)

    print("\n############  ASSEMBLED MODEL INPUT  ############\n")
    print(prompt)
    print("###################################################\n")

    if args.cv_file:
        print(f"[i] Scanned an uploaded CV file: {args.cv_file}")
    elif inject_attack:
        print(
            f"[!] This input contains a hidden instruction inside the "
            f"'{scenario.content_label}' data. A vulnerable model may "
            "obey it instead of answering the real user question above."
        )
        if args.defense:
            print(
                "[i] A border-string defense was applied, which tells "
                "the model to treat the fenced content as inert data."
            )
    else:
        print("[i] Ran with --no-attack: this is the clean, unmodified input.")

    if not args.no_guardrail:
        import guardrail

        print(f"\n----  GUARDRAIL SCAN ({guardrail.MODEL_NAME})  ----")
        result = guardrail.check(content)
        print(f"Scanned: external {scenario.content_label} content (before it reaches the model)")
        print(f"Label:   {result.label}")
        print(f"Score:   {result.score:.6f}")
        print(f"Verdict: {scenario.blocked_message if result.blocked else scenario.safe_message}")


if __name__ == "__main__":
    main()
