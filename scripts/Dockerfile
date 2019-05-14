FROM python:3.7.2
RUN pip install pygithub tqdm pandas dis
#RUN apt-get update  && apt-get install -y nodejs
#RUN npm install decomment
WORKDIR /app
COPY *.sh *.py ./
ENV SKIP_SETUP 1
ENTRYPOINT ["/bin/bash", "./run.sh"]
