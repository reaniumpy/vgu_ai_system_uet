"""Streamlit UI for the BIPIA-style indirect prompt injection demo."""

import streamlit as st

import guardrail
from scenarios import SCENARIOS, build_prompt, build_resume_pdf

st.set_page_config(page_title="Prompt Injection Demo", layout="wide")
st.title("Indirect Prompt Injection Demo")
st.caption(
    "How a hidden instruction inside external content can hijack an LLM, "
    "and how a real ML guardrail can catch it first."
)

scenario_key = st.selectbox("Scenario", options=list(SCENARIOS), format_func=str.capitalize)
scenario = SCENARIOS[scenario_key]

col1, col2, col3 = st.columns(3)
inject_attack = col1.toggle("Inject attack", value=True)
use_defense = col2.toggle("Border-string defense", value=False)
run_guardrail = col3.toggle("Run guardrail scan", value=True)

query_key = f"query_{scenario_key}"
st.session_state.setdefault(query_key, scenario.default_query)
query = st.text_input("Your question", key=query_key)

if scenario_key == "resume":
    pdf_bytes = build_resume_pdf(inject_attack)
    st.download_button(
        "Download generated resume PDF",
        data=pdf_bytes,
        file_name="resume_with_hidden_text.pdf" if inject_attack else "resume_clean.pdf",
        mime="application/pdf",
    )
    st.caption(
        "Open this in a real PDF viewer -- if the attack is injected, the "
        "hidden instruction is not visually apparent."
    )

if st.button("Run", type="primary"):
    content = scenario.get_content(inject_attack)
    prompt = build_prompt(query, content, use_defense, scenario)
    result = guardrail.check(content) if run_guardrail else None
    st.session_state["last_run"] = {"prompt": prompt, "result": result}

if "last_run" in st.session_state:
    run = st.session_state["last_run"]
    st.subheader("Assembled model input")
    st.code(run["prompt"], language="text")

    if run["result"] is not None:
        result = run["result"]
        color = "red" if result.blocked else "green"
        verdict = "BLOCKED" if result.blocked else "ALLOWED"
        st.subheader("Guardrail verdict")
        st.markdown(f":{color}[**{verdict}**]")
        st.write(f"Label: `{result.label}`  Score: `{result.score:.6f}`")
