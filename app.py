"""Streamlit UI for the BIPIA-style indirect prompt injection demo."""

import streamlit as st

import guardrail
import scenarios
from scenarios import SCENARIOS, build_prompt, build_resume_pdf

CUSTOM_QUERY_LABEL = "Custom (write your own)"


def _apply_suggested_query(query_key, choice_key):
    choice = st.session_state[choice_key]
    if choice != CUSTOM_QUERY_LABEL:
        st.session_state[query_key] = choice


st.set_page_config(page_title="Prompt Injection Demo", layout="wide")
st.title("Indirect Prompt Injection Demo")
st.caption(
    "How a hidden instruction inside external content can hijack an LLM, "
    "and how a real ML guardrail can catch it first."
)

scenario_key = st.selectbox("Scenario", options=list(SCENARIOS), format_func=str.capitalize)
scenario = SCENARIOS[scenario_key]

use_upload = False
uploaded_content = None

if scenario_key == "resume":
    use_upload = st.checkbox("Upload my own CV (PDF) instead of the sample")

col1, col2, col3 = st.columns(3)
inject_attack = col1.toggle("Inject attack", value=True, disabled=use_upload)
use_defense = col2.toggle("Border-string defense", value=False)
run_guardrail = col3.toggle("Run guardrail scan", value=True)
if use_upload:
    col1.caption("Ignored: the attack is whatever's actually in your uploaded file.")

query_key = f"query_{scenario_key}"
choice_key = f"suggestion_{scenario_key}"
st.session_state.setdefault(query_key, scenario.default_query)

st.selectbox(
    "Suggested questions",
    [CUSTOM_QUERY_LABEL] + scenario.suggested_queries,
    key=choice_key,
    on_change=_apply_suggested_query,
    args=(query_key, choice_key),
)
query = st.text_input("Your question", key=query_key)

if scenario_key == "resume":
    if use_upload:
        uploaded_file = st.file_uploader("Upload a CV/resume PDF", type=["pdf"])
        if uploaded_file is not None:
            uploaded_content = scenarios.extract_pdf_text(uploaded_file.getvalue())
            with st.expander("Extracted text preview"):
                st.text(uploaded_content)
    else:
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
    if use_upload and uploaded_content is None:
        st.warning("Upload a CV first, or uncheck the upload option to use the sample.")
    else:
        content = uploaded_content if use_upload else scenario.get_content(inject_attack)
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
