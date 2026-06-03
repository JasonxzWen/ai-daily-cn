import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { relativeAssetHref, reportRelativePaths } from "./paths.js";
import {
  cleanGithubTrendDescription,
  cleanProjectDescription,
  githubTrendStatusHighlightTag,
  projectHeatTags
} from "./presentation.js";
import { defaultImportanceForSection, importanceLabel, importanceTag, normalizeImportance } from "./importance.js";
import { CACHED_DOMAIN_ICONS, CACHED_SOURCE_ICONS } from "./source-icon-cache.js";

const execFileAsync = promisify(execFile);
const HUGGING_FACE_ICON =
  "data:image/svg+xml;base64," +
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NSIgaGVpZ2h0PSI4OCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0ZGRDIxRSIgZD0iTTQ3LjIxIDc2LjVhMzQuNzUgMzQuNzUgMCAxIDAgMC02OS41IDM0Ljc1IDM0Ljc1IDAgMCAwIDAgNjkuNVoiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTgxLjk2IDQxLjc1YTM0Ljc1IDM0Ljc1IDAgMSAwLTY5LjUgMCAzNC43NSAzNC43NSAwIDAgMCA2OS41IDBabS03My41IDBhMzguNzUgMzguNzUgMCAxIDEgNzcuNSAwIDM4Ljc1IDM4Ljc1IDAgMCAxLTc3LjUgMFoiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZD0iTTU4LjUgMzIuM2MxLjI4LjQ0IDEuNzggMy4wNiAzLjA3IDIuMzhhNSA1IDAgMSAwLTYuNzYtMi4wN2MuNjEgMS4xNSAyLjU1LS43MiAzLjctLjMyWk0zNC45NSAzMi4zYy0xLjI4LjQ0LTEuNzkgMy4wNi0zLjA3IDIuMzhhNSA1IDAgMSAxIDYuNzYtMi4wN2MtLjYxIDEuMTUtMi41Ni0uNzItMy43LS4zMloiIC8+PHBhdGggZmlsbD0iI0ZGMzIzRCIgZD0iTTQ2Ljk2IDU2LjI5YzkuODMgMCAxMy04Ljc2IDEzLTEzLjI2IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNi0yLjMzIDEuMTUtNS40NiAyLjc0LTguOSAyLjc0LTcuMTkgMC0xMy02Ljg4LTEzLTIuMzhzMy4xNiAxMy4yNiAxMyAxMy4yNloiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzkuNDMgNTRhOC43IDguNyAwIDAgMSA1LjMtNC40OWMuNC0uMTIuODEuNTcgMS4yNCAxLjI4LjQuNjguODIgMS4zNyAxLjI0IDEuMzcuNDUgMCAuOS0uNjggMS4zMy0xLjM1LjQ1LS43Ljg5LTEuMzggMS4zMi0xLjI1YTguNjEgOC42MSAwIDAgMSA1IDQuMTdjMy43My0yLjk0IDUuMS03Ljc0IDUuMS0xMC43IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNmwtLjE0LjA3Yy0yLjMxIDEuMTUtNS4zOSAyLjY3LTguNzcgMi42N3MtNi40NS0xLjUyLTguNzctMi42N2MtMi42LTEuMjktNC4yMy0yLjEtNC4yMy4yOSAwIDMuMDUgMS40NiA4LjA2IDUuNDcgMTAuOTdaIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTcwLjcxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTI0LjIxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTE3LjUyIDQ4Yy0xLjYyIDAtMy4wNi42Ni00LjA3IDEuODdhNS45NyA1Ljk3IDAgMCAwLTEuMzMgMy43NiA3LjEgNy4xIDAgMCAwLTEuOTQtLjNjLTEuNTUgMC0yLjk1LjU5LTMuOTQgMS42NmE1LjggNS44IDAgMCAwLS44IDcgNS4zIDUuMyAwIDAgMC0xLjc5IDIuODJjLS4yNC45LS40OCAyLjguOCA0Ljc0YTUuMjIgNS4yMiAwIDAgMC0uMzcgNS4wMmMxLjAyIDIuMzIgMy41NyA0LjE0IDguNTIgNi4xIDMuMDcgMS4yMiA1Ljg5IDIgNS45MSAyLjAxYTQ0LjMzIDQ0LjMzIDAgMCAwIDEwLjkzIDEuNmM1Ljg2IDAgMTAuMDUtMS44IDEyLjQ2LTUuMzQgMy44OC01LjY5IDMuMzMtMTAuOS0xLjctMTUuOTItMi43Ny0yLjc4LTQuNjItNi44Ny01LTcuNzctLjc4LTIuNjYtMi44NC01LjYyLTYuMjUtNS42MmE1LjcgNS43IDAgMCAwLTQuNiAyLjQ2Yy0xLTEuMjYtMS45OC0yLjI1LTIuODYtMi44MkE3LjQgNy40IDAgMCAwIDE3LjUyIDQ4Wm0wIDRjLjUxIDAgMS4xNC4yMiAxLjgyLjY1IDIuMTQgMS4zNiA2LjI1IDguNDMgNy43NiAxMS4xOC41LjkyIDEuMzcgMS4zMSAyLjE0IDEuMzEgMS41NSAwIDIuNzUtMS41My4xNS0zLjQ4LTMuOTItMi45My0yLjU1LTcuNzItLjY4LTguMDEuMDgtLjAyLjE3LS4wMi4yNC0uMDIgMS43IDAgMi40NSAyLjkzIDIuNDUgMi45M3MyLjIgNS41MiA1Ljk4IDkuM2MzLjc3IDMuNzcgMy45NyA2LjggMS4yMiAxMC44My0xLjg4IDIuNzUtNS40NyAzLjU4LTkuMTYgMy41OC0zLjgxIDAtNy43My0uOS05LjkyLTEuNDYtLjExLS4wMy0xMy40NS0zLjgtMTEuNzYtNyAuMjgtLjU0Ljc1LS43NiAxLjM0LS43NiAyLjM4IDAgNi43IDMuNTQgOC41NyAzLjU0LjQxIDAgLjctLjE3LjgzLS42Ljc5LTIuODUtMTIuMDYtNC4wNS0xMC45OC04LjE3LjItLjczLjcxLTEuMDIgMS40NC0xLjAyIDMuMTQgMCAxMC4yIDUuNTMgMTEuNjggNS41My4xMSAwIC4yLS4wMy4yNC0uMS43NC0xLjIuMzMtMi4wNC00LjktNS4yLTUuMjEtMy4xNi04Ljg4LTUuMDYtNi44LTcuMzMuMjQtLjI2LjU4LS4zOCAxLS4zOCAzLjE3IDAgMTAuNjYgNi44MiAxMC42NiA2LjgyczIuMDIgMi4xIDMuMjUgMi4xYy4yOCAwIC41Mi0uMS42OC0uMzguODYtMS40Ni04LjA2LTguMjItOC41Ni0xMS4wMS0uMzQtMS45LjI0LTIuODUgMS4zMS0yLjg1WiIgLz48cGF0aCBmaWxsPSIjRkZEMjFFIiBkPSJNMzguNiA3Ni42OWMyLjc1LTQuMDQgMi41NS03LjA3LTEuMjItMTAuODQtMy43OC0zLjc3LTUuOTgtOS4zLTUuOTgtOS4zcy0uODItMy4yLTIuNjktMi45Yy0xLjg3LjMtMy4yNCA1LjA4LjY4IDguMDEgMy45MSAyLjkzLS43OCA0LjkyLTIuMjkgMi4xNy0xLjUtMi43NS01LjYyLTkuODItNy43Ni0xMS4xOC0yLjEzLTEuMzUtMy42My0uNi0zLjEzIDIuMi41IDIuNzkgOS40MyA5LjU1IDguNTYgMTEtLjg3IDEuNDctMy45My0xLjcxLTMuOTMtMS43MXMtOS41Ny04LjcxLTExLjY2LTYuNDRjLTIuMDggMi4yNyAxLjU5IDQuMTcgNi44IDcuMzMgNS4yMyAzLjE2IDUuNjQgNCA0LjkgNS4yLS43NSAxLjItMTIuMjgtOC41My0xMy4zNi00LjQtMS4wOCA0LjExIDExLjc3IDUuMyAxMC45OCA4LjE1LS44IDIuODUtOS4wNi01LjM4LTEwLjc0LTIuMTgtMS43IDMuMjEgMTEuNjUgNi45OCAxMS43NiA3LjAxIDQuMyAxLjEyIDE1LjI1IDMuNDkgMTkuMDgtMi4xMloiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTc3LjQgNDhjMS42MiAwIDMuMDcuNjYgNC4wNyAxLjg3YTUuOTcgNS45NyAwIDAgMSAxLjMzIDMuNzYgNy4xIDcuMSAwIDAgMSAxLjk1LS4zYzEuNTUgMCAyLjk1LjU5IDMuOTQgMS42NmE1LjggNS44IDAgMCAxIC44IDcgNS4zIDUuMyAwIDAgMSAxLjc4IDIuODJjLjI0LjkuNDggMi44LS44IDQuNzRhNS4yMiA1LjIyIDAgMCAxIC4zNyA1LjAyYy0xLjAyIDIuMzItMy41NyA0LjE0LTguNTEgNi4xLTMuMDggMS4yMi01LjkgMi01LjkyIDIuMDFhNDQuMzMgNDQuMzMgMCAwIDEtMTAuOTMgMS42Yy01Ljg2IDAtMTAuMDUtMS44LTEyLjQ2LTUuMzQtMy44OC01LjY5LTMuMzMtMTAuOSAxLjctMTUuOTIgMi43OC0yLjc4IDQuNjMtNi44NyA1LjAxLTcuNzcuNzgtMi42NiAyLjgzLTUuNjIgNi4yNC01LjYyYTUuNyA1LjcgMCAwIDEgNC42IDIuNDZjMS0xLjI2IDEuOTgtMi4yNSAyLjg3LTIuODJBNy40IDcuNCAwIDAgMSA3Ny40IDQ4Wm0wIDRjLS41MSAwLTEuMTMuMjItMS44Mi42NS0yLjEzIDEuMzYtNi4yNSA4LjQzLTcuNzYgMTEuMThhMi40MyAyLjQzIDAgMCAxLTIuMTQgMS4zMWMtMS41NCAwLTIuNzUtMS41My0uMTQtMy40OCAzLjkxLTIuOTMgMi41NC03LjcyLjY3LTguMDFhMS41NCAxLjU0IDAgMCAwLS4yNC0uMDJjLTEuNyAwLTIuNDUgMi45My0yLjQ1IDIuOTNzLTIuMiA1LjUyLTUuOTcgOS4zYy0zLjc4IDMuNzctMy45OCA2LjgtMS4yMiAxMC44MyAxLjg3IDIuNzUgNS40NyAzLjU4IDkuMTUgMy41OCAzLjgyIDAgNy43My0uOSA5LjkzLTEuNDYuMS0uMDMgMTMuNDUtMy44IDExLjc2LTctLjI5LS41NC0uNzUtLjc2LTEuMzQtLjc2LTIuMzggMC02LjcxIDMuNTQtOC41NyAzLjU0LS40MiAwLS43MS0uMTctLjgzLS42LS44LTIuODUgMTIuMDUtNC4wNSAxMC45Ny04LjE3LS4xOS0uNzMtLjctMS4wMi0xLjQ0LTEuMDItMy4xNCAwLTEwLjIgNS41My0xMS42OCA1LjUzLS4xIDAtLjE5LS4wMy0uMjMtLjEtLjc0LTEuMi0uMzQtMi4wNCA0Ljg4LTUuMiA1LjIzLTMuMTYgOC45LTUuMDYgNi44LTcuMzMtLjIzLS4yNi0uNTctLjM4LS45OC0uMzgtMy4xOCAwLTEwLjY3IDYuODItMTAuNjcgNi44MnMtMi4wMiAyLjEtMy4yNCAyLjFhLjc0Ljc0IDAgMCAxLS42OC0uMzhjLS44Ny0xLjQ2IDguMDUtOC4yMiA4LjU1LTExLjAxLjM0LTEuOS0uMjQtMi44NS0xLjMxLTIuODVaIiAvPjxwYXRoIGZpbGw9IiNGRkQyMUUiIGQ9Ik01Ni4zMyA3Ni42OWMtMi43NS00LjA0LTIuNTYtNy4wNyAxLjIyLTEwLjg0IDMuNzctMy43NyA1Ljk3LTkuMyA1Ljk3LTkuM3MuODItMy4yIDIuNy0yLjljMS44Ni4zIDMuMjMgNS4wOC0uNjggOC4wMS0zLjkyIDIuOTMuNzggNC45MiAyLjI4IDIuMTcgMS41MS0yLjc1IDUuNjMtOS44MiA3Ljc2LTExLjE4IDIuMTMtMS4zNSAzLjY0LS42IDMuMTMgMi4yLS41IDIuNzktOS40MiA5LjU1LTguNTUgMTEgLjg2IDEuNDcgMy45Mi0xLjcxIDMuOTItMS43MXM5LjU4LTguNzEgMTEuNjYtNi40NGMyLjA4IDIuMjctMS41OCA0LjE3LTYuOCA3LjMzLTUuMjMgMy4xNi01LjYzIDQtNC45IDUuMi43NSAxLjIgMTIuMjgtOC41MyAxMy4zNi00LjQgMS4wOCA0LjExLTExLjc2IDUuMy0xMC45NyA4LjE1LjggMi44NSA5LjA1LTUuMzggMTAuNzQtMi4xOCAxLjY5IDMuMjEtMTEuNjUgNi45OC0xMS43NiA3LjAxLTQuMzEgMS4xMi0xNS4yNiAzLjQ5LTE5LjA4LTIuMTJaIiAvPjwvc3ZnPg==";

const OPENAI_STATUS_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACHFBMVEVMaXH////////////////////+/v7////////////////////////////////////+/v7////////////+/v7+/v7////////////////////////////////////////////+/v7////////////+/v79/f38/Pz7+/sAAAD4+Pj6+vq/v7/U1NQFBQVmZmb09PTx8fHr6+v5+fnW1tZcXFwWFhYPDw8wMDAaGhqGhoZXV1fFxcU9PT2mpqYtLS3h4eFra2szMzNGRkbs7OwGBgYZGRn29va2trYpKSkuLi5dXV0YGBheXl42NjaHh4ciIiJsbGwlJSWdnZ1oaGjv7+/Hx8c/Pz9PT08yMjKXl5csLCxYWFiNjY2Dg4McHBxDQ0O+vr7V1dWAgIADAwPf3986OjpZWVnk5ORvb28VFRV1dXUeHh5ISEhkZGSLi4uBgYGFhYWxsbGnp6cODg53d3cqKirl5eVfX19QUFDGxsbDw8OCgoISEhJ/f3/e3t719fUQEBAvLy9AQEARERGqqqqIiIgbGxu0tLQnJye1tbXn5+fm5uakpKQ8PDwmJiZtbW1iYmLS0tIICAgJCQkkJCQgICAEBAQ+Pj68vLwoKCibm5sUFBQNDQ0xMTHg4OCcnJxHR0ezs7OgoKDu7u4dHR3ExMTd3d3CwsJMTEzt7e0HBwfJycmioqJNTU1jY2PKysrIyMgXFxcTExM406YOAAAAJHRSTlMAASzMAwL8/f77DYyem9DoKef5MPbtX+wYzl7wG+s3jQw4nZzRy0erAAAACXBIWXMAAAsTAAALEwEAmpwYAAACwElEQVR4nH1TZVcjQRAcYpsQ3IJrze7GBUgCBHd3d3d3PXd3d3f7g/dmFw74cv1l39uprumpriJEKj8VIdFRATGRHBcZExAVTYjKjxwptZooAuKghVRaxKUq2L9/pSL+SWEAp+MopA8Qpk8mqsPzkCBwGi0VBF7kJQ4Nh6CQA4SKJAZDpwVl7QAviCIPrQ7BKTJCTRSh0AAU5ryeYrtFRlFoEKogakL8iL+SnfMo6Kypnpydahzs7cpgdBoo/YkfURM9dKzfkZ8pgseqcaausrTDBQod9IwiPAJa0HQMXweFz5vVXA5+qCjfCapFRDghJJAR8LDee4P1DVuLC6ZWwNxdCAE6BBISnwAthdn+wObDZlMGsP38zoIDeTXljCIhnsSCoxSZ97febSM3Gy9ant5cbrhwceKUFTw4xLIbBFR4Poju92jfe/LMWAuY6j1F7hPSmGlECU7AeA7e1nzEJ+PjJcvapQrgauaIRWJQEgNb0dgiWrN8eJjD3j9nfGUF6vtL2BAGwjENBqbh3G1mM5hMmPf++LIDVPVBBDgGENFXBezYbnnnGSA7F99WWjE9AMoABvbKkv7zwO1i4xy7IqcdP39/xuIYc4aBDQkelpHqK8DlG5WPXq8Zv6PtTwlyxiGwIdOgA8Wou2ql3gTUGj0v99rxazd91FMBgUkZKzFYz04sZTUsN7oLC9gMbWVtDZmglAklS32y7BwcC3frtoCMpk18LbXZzftSS8sSUHhaBJzpcLXYNtZxrYkJLS9LWjeFM79oiEd5c5bXB4ozw0inkNctG4bC1VFaWTdjXAUPobbbwTSQDbNvOUqR0dU72Dg1O1ld1lnALti33IFpqeR3WOzFPXlm1n9gWmb7FMn2vCgKMopSyfaJh8GQgyP5XeQFgR4PDkMk6+XosXY5ekn+h+dyeFOPhjfgeHj/F/+/Zvqm8OFp/WAAAAAASUVORK5CYII=";
const GITHUB_BLOG_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABqlBMVEVHcEwYGBgXFxcZFxcYFhYZGRkYFhYYFhYUFBQAAAAcHBwYFRUYFhYZFhYYFRUXFhYXFxcYFhYYFhYYFhYZFhYXFxcYFhYYFhYYFhYaGhoWFhYAAAAAAAAYFRUXFxcYFhYXFxcZFhYYFhYAAAAkJCQAAAAZFBQYFBQSEhIZFRUaFhYgEBAYFhYYFBQYFhYYFhYYFxcYFhYYFhYXFRUXFxcYFhYYFhYYFRUXFhYzAAAXFxcWFhYYFhYYFRUYFhYYGBgZFhYYFRUYFhYYFhYXFxcXFxcYFxcYFhYYFRUYFhYVFRUYFhYXFRUYFhYYFhYZFhYqAAAXFxcZFhYZFRUWFhYZFRUYFxcZFhYZFhYYFhYZFhYZGRkXFxcZFxcYFhYVFRUYFhYXFhYYFhYZFhYYFRUZFhYYFhYYFhYXFRUaFxceDw8YFRUYFhYVFRUZFRUWFhYXFxcYFhYYFhYQEBAaFhYTExMaGhoaGhoYFhYYFhYXFxcaFRUWFhYZFxcYFxcqKioaFBQXFxcYFRUWFhYYFhYYFxcaFBQYFhYYFhYYFRUXFhYaFhYZFhYYFhathGCcAAAAjXRSTlMAICxw/Cnt/hkCCVSxUbOkWfPj9GdD9mnTCiIBBUpa1Tem+wMHBDQ/DptGENtLq8L56qptC3OVSboFWC73a3YqXFbn7FdCqcdfagzBeKz52gZkaD4vSJJyup9HHy16+jB+5OldYa+49WNaEb+MJJAjb7aXEDsbHRT9ghY8Ony/BjIhp0TNkyfx3FX6Rc+4kjohAAABpElEQVQ4y22T5XvCQAzGM6DCYLDB3McGzN3d3d3d3d3d7n9eL6Vr6TVf3iS/9+lzd0kBNJFoyttKTuLSwTBKN9c3CEaEYyWUwaFzPNHE8sRgME8dILqIHdXyzn7CRLRN5ZECMQhLssKTLMQwCkdkLrZIhbPGnKuilC6TXZKlbTSk0VY4gNfcXm+Limrq7Yu0AsTQ7jHlC3iANv29w2jXcyBlUyTwheAYxva+9EIRmDXqDXXYLkqHaUwqmadN6ECQCouoY+xsWhEcgpOKEMcaRDSUwyQVt8F0E9GQDztU5hNYQzca1uAI9Yw1NCBIgyxUG2sYQrALZlQHayhAsAo+VKFCz6vlse2B1YXJR7ZuFNHyWKX0ipD7N54Iz36vQjOy7YG5l0nVtZu4Kr4+6TY7rRRXOWqVveAzaeNOeqj3skJ1pDH/i1OC9cMrIcViScFvfo5sMCm8xyo3noqI5aeUe7kJHCEkwF2icqhHnnyX592GZQQZmjn1Upy8sDlaQ2y89tqZWXQzL+Qinv4U4/oN8NkvhRM5nSGe4lmDBTg/VTK/qHb/AERH3u9xwIrQAAAAAElFTkSuQmCC";

const SOURCE_ICONS = new Map([
  ...Object.entries(CACHED_SOURCE_ICONS),
  ["OpenAI", OPENAI_STATUS_ICON],
  ["OpenAI News", OPENAI_STATUS_ICON],
  ["OpenAI News RSS", OPENAI_STATUS_ICON],
  ["OpenAI Status", OPENAI_STATUS_ICON],
  ["GitHub", GITHUB_BLOG_ICON],
  ["GitHub Changelog", GITHUB_BLOG_ICON],
  ["GitHub Trending", GITHUB_BLOG_ICON],
  ["GitHub Trending daily", GITHUB_BLOG_ICON],
  ["GitHub Trending weekly", GITHUB_BLOG_ICON],
  ["AWS What's New", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["AWS Machine Learning Blog", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["AWS for SAP Blog", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["Anthropic", generatedSiteIcon("A", "#111111", "#d8c4a5")],
  ["Anthropic Research", generatedSiteIcon("A", "#111111", "#d8c4a5")],
  ["Claude Status", generatedSiteIcon("C", "#111111", "#d8c4a5")],
  ["Mistral AI", generatedSiteIcon("M", "#ff7000", "#ffffff")],
  ["Mistral Docs", generatedSiteIcon("M", "#ff7000", "#ffffff")],
  ["Microsoft", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["Microsoft Foundry Blog", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["Microsoft Research Blog", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["MiniMax Blog", generatedSiteIcon("MM", "#2563eb", "#ffffff")],
  ["MiniMax model page", generatedSiteIcon("MM", "#2563eb", "#ffffff")],
  ["NVIDIA", generatedSiteIcon("NV", "#76b900", "#111827")],
  ["NVIDIA Developer Blog", generatedSiteIcon("NV", "#76b900", "#111827")],
  ["Hugging Face Blog / NVIDIA", generatedSiteIcon("HF", "#ffd21e", "#3a3b45")],
  ["Alibaba Cloud Blog", generatedSiteIcon("AC", "#ff6a00", "#ffffff")],
  ["Vercel", generatedSiteIcon("V", "#000000", "#ffffff")],
  ["Guillermo Rauch X status", generatedSiteIcon("X", "#111111", "#ffffff")],
  ["Nature Communications", generatedSiteIcon("N", "#0f172a", "#ffffff")],
  ["Claude official X", generatedSiteIcon("X", "#111111", "#ffffff")],
  ["Simon Willison Weblog", generatedSiteIcon("SW", "#2f6f9f", "#ffffff")],
  ["AI & I / Every", generatedSiteIcon("E", "#111827", "#f7f1e8")]
]);

const DOMAIN_ICONS = new Map([
  ...Object.entries(CACHED_DOMAIN_ICONS),
  ["openai.com", OPENAI_STATUS_ICON],
  ["status.openai.com", OPENAI_STATUS_ICON],
  ["github.com", GITHUB_BLOG_ICON],
  ["github.blog", GITHUB_BLOG_ICON],
  ["raw.githubusercontent.com", GITHUB_BLOG_ICON],
  ["huggingface.co", HUGGING_FACE_ICON],
  ["aws.amazon.com", SOURCE_ICONS.get("AWS What's New")],
  ["amazon.com", SOURCE_ICONS.get("AWS What's New")],
  ["microsoft.com", SOURCE_ICONS.get("Microsoft")],
  ["devblogs.microsoft.com", SOURCE_ICONS.get("Microsoft Foundry Blog")],
  ["minimax.io", SOURCE_ICONS.get("MiniMax model page")],
  ["developer.nvidia.com", SOURCE_ICONS.get("NVIDIA Developer Blog")],
  ["nvidia.com", SOURCE_ICONS.get("NVIDIA")],
  ["alibabacloud.com", SOURCE_ICONS.get("Alibaba Cloud Blog")],
  ["vercel.com", SOURCE_ICONS.get("Vercel")],
  ["nature.com", SOURCE_ICONS.get("Nature Communications")],
  ["status.claude.com", SOURCE_ICONS.get("Claude Status")],
  ["claude.com", SOURCE_ICONS.get("Claude Status")],
  ["anthropic.com", SOURCE_ICONS.get("Anthropic")],
  ["mistral.ai", SOURCE_ICONS.get("Mistral AI")],
  ["x.com", SOURCE_ICONS.get("Claude official X")],
  ["twitter.com", SOURCE_ICONS.get("Claude official X")],
  ["simonwillison.net", SOURCE_ICONS.get("Simon Willison Weblog")],
  ["every.to", SOURCE_ICONS.get("AI & I / Every")]
]);

for (const [source, icon] of Object.entries(CACHED_SOURCE_ICONS)) {
  SOURCE_ICONS.set(source, icon);
}

for (const [domain, icon] of Object.entries(CACHED_DOMAIN_ICONS)) {
  DOMAIN_ICONS.set(domain, icon);
}

export function reportToInteractionInput(report, options = {}) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const githubTrending = Array.isArray(report.github_trending) ? report.github_trending : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const evidenceAssets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const evidenceByUrl = evidenceAssetsBySourceUrl(evidenceAssets);
  const paths = reportRelativePaths(report.report_date);
  const dataHref = publicAssetUrl(report, paths.dataPath);
  const indexHref = publicAssetUrl(report, "index.html");
  const trendAnnotations = normalizeTrendAnnotations(options.trendAnnotations);
  const sections = [
    ...formatMainItemSections(mainItems, { report, evidenceByUrl, trendAnnotations })
  ];

  if (hotBlogs.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "热门技术博客",
      group: "main",
      cardClass: "blog-card",
      filterLabel: "博客主题筛选",
      showFilters: false,
      items: formatHotBlogCards(hotBlogs, { report, evidenceByUrl })
    });
  }
  if (githubTrending.length > 0) {
    sections.push({
      type: "markdown",
      title: "GitHub Trending · Top 10",
      group: "projects",
      content: formatGithubTrending(githubTrending, { trendAnnotations, projects })
    });
  }
  if (builderObservations.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "X/Twitter 讨论",
      group: "signals",
      cardClass: "builder-card",
      showFilters: false,
      items: formatBuilderObservationCards(builderObservations, report)
    });
  }
  const twitterDegradation = builderObservations.length === 0
    ? formatTwitterDiscussion(builderObservations, report.source_audit?.builder_sources)
    : "";
  if (twitterDegradation) {
    sections.push({
      type: "markdown",
      title: "X/Twitter 讨论",
      group: "signals",
      content: twitterDegradation
    });
  }
  const domesticCommunityLeads = communityLeads.filter(isDomesticCommunityLead);
  const remainingCommunityLeads = communityLeads.filter((item) => !isDomesticCommunityLead(item));
  const domesticCommunitySection = formatCommunityLeads(domesticCommunityLeads);
  if (domesticCommunitySection) {
    sections.push({
      type: "markdown",
      title: "国内动态",
      group: "signals",
      content: domesticCommunitySection
    });
  }
  const communitySection = formatCommunityLeads(remainingCommunityLeads);
  if (communitySection) {
    sections.push({
      type: "markdown",
      title: "社区线索",
      group: "signals",
      content: communitySection
    });
  }
  const qualityStatus = formatQualityStatus(report.quality_status);
  if (qualityStatus) {
    sections.push({
      type: "markdown",
      title: "发布质量说明",
      group: "verification",
      content: qualityStatus
    });
  }
  sections.push(
    {
      type: "markdown",
      title: "信源审计",
      group: "verification",
      appendix: true,
      appendixLabel: "附录",
      collapsed: true,
      summary: "来源、候选池和重试记录，默认折叠。",
      content: formatSourceAudit(report.source_audit)
    },
    {
      type: "markdown",
      title: "自检与产物",
      group: "verification",
      appendix: true,
      appendixLabel: "附录",
      collapsed: true,
      summary: "验证结果、结构化 JSON 和后续规则建议，默认折叠。",
      content: `${formatSelfCheck(report.self_check)}\n\n- ${markdownLink(dataHref, "结构化 JSON")}`
    }
  );

  return {
    title: report.title,
    summary: editorialSummary(report),
    heroMode: "daily-report",
    heroTitle: report.report_date,
    heroEyebrow: dailyHeroEyebrow(report),
    heroStats: dailyHeroStats(report, {
      mainItems,
      hotBlogs,
      githubTrending,
      projects,
      builderObservations,
      communityLeads
    }),
    heroLinks: [
      { label: "日报导航", href: indexHref, icon: siteIconForUrl(indexHref, "AI") },
      { label: "结构化 JSON", href: dataHref, icon: siteIconForUrl(dataHref, "JSON") }
    ],
    hideNavigation: false,
    status: "complete",
    template: "research-explainer",
    renderMode: "pre-rendered",
    generatedAt: report.generated_at,
    intent: {
      audience: "3-10 年经验的研发工程师与技术管理者",
      primaryQuestion: `${report.report_date} 有哪些值得跟进的 AI 产品、模型、工程工具和开源项目动态？`,
      decision: "只保留有可回源证据、与工程工作流相关、且通过日报自检的条目。",
      timeBudget: "8 分钟",
      artifactKind: "research",
      successCriteria: [
        "主体信息不强行凑数",
        "模型发布合入主体信息",
        "项目 highlight 仅作为 tag 出现在 GitHub Trending 条目上",
        "信源审计可展开",
        "结构化 JSON 可追溯"
      ],
      ...dailyIntent(report)
    },
    sections,
    nextActions: []
  };
}

function editorialSummary(report) {
  const summary = String(report?.summary || "").trim();
  if (!isProcessStatusSummary(summary)) {
    return summary;
  }

  const highlights = Array.isArray(report?.hero_highlights) ? report.hero_highlights : [];
  const highlightSummary = highlights
    .slice(0, 3)
    .map((item) => {
      const title = String(item?.title || "").trim();
      const reason = String(item?.reason || "").trim();
      if (!title) return "";
      return reason ? `${title}：${reason}` : title;
    })
    .filter(Boolean)
    .join("；");
  if (highlightSummary) {
    return `今日主线：${highlightSummary}`;
  }

  const mainTitles = (Array.isArray(report?.main_items) ? report.main_items : [])
    .slice(0, 3)
    .map((item) => String(item?.title || "").trim())
    .filter(Boolean)
    .join("、");
  return mainTitles ? `今日主线围绕 ${mainTitles} 展开。` : summary;
}

function isProcessStatusSummary(summary) {
  return /最新\s*main|重新生成|结构化\s*JSON|内容单元|扩展为\s*\d+\s*条|generated from|regenerated|build log/i.test(summary);
}

function dailyIntent(report) {
  return {
    audience: "普通工程师：有技术能力，关注 AI 行业内模型、公司、工具、产品、开源项目、观点和社区讨论。",
    primaryQuestion: `${report.report_date} 有哪些值得普通工程师跟进的 AI 行业、模型、产品、开源、观点和社区动态？`,
    decision: "事实主线只保留可回溯的一手、官方、论文、GitHub 或多源确认条目；观点和社区线索必须披露来源层级与风险。",
    successCriteria: [
      "主体信息解释为什么重要或与工程师的关系",
      "观点、播客、社区讨论和产品雷达承载高密度但标明来源风险",
      "HTML 保留结构化导航、卡片、证据图片和 source_audit 附录",
      "结构化 JSON 可回溯到候选池与核验状态"
    ]
  };
}

function dailyHeroStats(report, collections) {
  const sourceWindow = report.source_window || {};
  const builderCount = collections.builderObservations.length + collections.communityLeads.length;
  const aigcCount = countAigcSignals(collections);
  return [
    { label: "主体", value: String(collections.mainItems.length), detail: "重点条目" },
    { label: "AIGC", value: String(aigcCount), detail: "产品/内容" },
    { label: "技术博客", value: String(collections.hotBlogs.length), detail: "深读" },
    { label: "GitHub", value: String(collections.githubTrending.length), detail: "Top 10" },
    { label: "Builder", value: String(builderCount), detail: "观察" },
    {
      label: "覆盖",
      value: formatHeroDateRange(sourceWindow.date_from, sourceWindow.date_to) || formatHeroDate(report.report_date),
      detail: sourceWindow.fallback_window_used ? "扩展时间范围" : "标准时间范围"
    }
  ];
}

function dailyHeroEyebrow(report) {
  const range = formatHeroFullDateRange(report.source_window?.date_from, report.source_window?.date_to);
  return range ? `AI 日报 · 覆盖 ${range}` : "AI 日报";
}

function formatHeroFullDateRange(dateFrom, dateTo) {
  const start = formatFullDate(dateFrom);
  const end = formatFullDate(dateTo);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} 至 ${end}`;
}

function formatFullDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function countAigcSignals(collections) {
  const items = [
    ...collections.mainItems,
    ...collections.hotBlogs,
    ...collections.githubTrending,
    ...collections.projects,
    ...collections.communityLeads
  ];
  return items.filter((item) => {
    const text = [
      item?.title,
      item?.name,
      item?.repo,
      item?.topic,
      item?.summary,
      item?.description,
      item?.content,
      Array.isArray(item?.tags) ? item.tags.join(" ") : ""
    ]
      .filter(Boolean)
      .join(" ");
    return /\bAIGC\b|video|image|creator|content|cover|AI PC|agent PC|Grok Imagine|Cosmos|MoneyPrinter|Qwen Code|Model Studio/i.test(text);
  }).length;
}

function formatQualityStatus(status) {
  if (!status || typeof status !== "object" || status.status === "ok") {
    return "";
  }
  const label = status.status === "blocked" ? "阻断" : "降级";
  const note = String(status.public_note || "").trim();
  const issues = [
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : []),
    ...affectedSectionIssues(status)
  ];
  const lines = [`- **状态**：${label}`];
  if (note) {
    lines.push(`- **公开说明**：${note}`);
  }
  for (const issue of issues) {
    const section = issue?.section || "unknown";
    const code = issue?.code || issue?.error_code || "quality_issue";
    const message = issue?.message || "";
    lines.push(`- **${section}**（${code}）：${message}`);
  }
  return lines.join("\n");
}

function affectedSectionIssues(status) {
  if (!Array.isArray(status.affected_sections) || status.affected_sections.length === 0) {
    return [];
  }
  const existing = new Set([
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : [])
  ].map((issue) => issue?.section).filter(Boolean));
  return status.affected_sections
    .filter((section) => section && !existing.has(section))
    .map((section) => ({
      code: "affected_section_degraded",
      section,
      message: "该板块存在公开说明中的降级风险。"
    }));
}

function formatHeroDateRange(dateFrom, dateTo) {
  const start = formatHeroDate(dateFrom);
  const end = formatHeroDate(dateTo);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start}..${end}`;
}

function formatHeroDate(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

export async function renderReportWithEffectiveInteract(report, options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const skillDir = await resolveSkillDir(rootDir, options.skillDir);
  const createScript = path.join(skillDir, "scripts", "create-interaction.mjs");
  const scratchDir =
    options.scratchDir || path.join(rootDir, ".tmp", `effective-interact-daily-${process.pid}`);
  const inputDir = path.join(scratchDir, "inputs");
  const outputDir = path.join(scratchDir, "html");
  const inputPath = path.join(inputDir, `${report.report_date}.json`);

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify(reportToInteractionInput(report, {
    trendAnnotations: options.trendAnnotations
  }), null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    "--input",
    inputPath,
    "--out-dir",
    outputDir,
    "--slug",
    `ai-daily-${report.report_date}`,
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  let payload = null;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new PublisherError("effective_interact_output_invalid", "effective-interact 生成器输出不是有效 JSON。", {
      cause: error.message,
      stdout
    });
  }

  if (!payload.ok || !payload.outputPath) {
    throw new PublisherError("effective_interact_generation_failed", "effective-interact 生成器未返回有效 HTML 产物。", payload);
  }

  return normalizePublicHtml(await fs.readFile(payload.outputPath, "utf8"));
}

function publicAssetUrl(report, assetPath) {
  if (report.canonical_url && report.html_path) {
    return new URL(relativeAssetHref(report.html_path, assetPath), report.canonical_url).toString();
  }

  return new URL(assetPath, DEFAULT_SITE.siteUrl).toString();
}

async function resolveSkillDir(rootDir, requestedSkillDir) {
  if (requestedSkillDir) {
    return path.resolve(requestedSkillDir);
  }

  const candidates = [
    path.join(rootDir, ".codex/skills/effective-interact"),
    path.join(process.cwd(), ".codex/skills/effective-interact")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "scripts", "create-interaction.mjs"));
      return path.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return path.resolve(candidates[0]);
}

function normalizePublicHtml(html) {
  return html.replaceAll('rel="noreferrer"', 'rel="noopener noreferrer"');
}

function normalizeTrendAnnotations(value) {
  const annotations = value && typeof value === "object" ? value : {};
  return {
    main_items: Array.isArray(annotations.main_items) ? annotations.main_items : [],
    github_trending: Array.isArray(annotations.github_trending) ? annotations.github_trending : []
  };
}

function trendTagsFor(annotations, section, index) {
  const match = (annotations?.[section] || []).find((item) => item.index === index);
  if (!match || !Array.isArray(match.tags)) {
    return [];
  }
  return match.tags.map((tag) => tag.text || tag.label).filter(Boolean);
}

function formatMainItemSections(items, context = {}) {
  if (items.length === 0) {
    return [
      {
        type: "markdown",
        title: "AI 资讯",
        group: "main",
        content: emptyMainItemContent(context)
      }
    ];
  }

  return mainItemContractGroups(items)
    .map((group) => ({
      type: "markdown",
      title: group.title,
      group: "main",
      content: group.entries
        .map(({ item, originalIndex }, groupIndex) => formatMainItem(item, {
          ...context,
          originalIndex,
          displayIndex: groupIndex + 1
        }))
        .join("\n\n")
    }));
}

function emptyMainItemContent(context = {}) {
  if (context.report?.report_status === "empty_due_to_network_outage") {
    return "本次固定信源发现面全部因网络不可用阻塞，未写入未核验主体事实。请展开“发布质量说明”和“信源审计”查看各来源状态。";
  }
  return "暂无已核验信号。";
}

function formatMainItem(item, context = {}) {
  const bullets = [...item.bullets, ...editorialBullets(item)]
    .map((bullet) => `  - ${formatDailyInlineText(bullet, item)}`)
    .join("\n");
  const title = markdownLink(item.url, mainItemTitle(item), { icon: mainItemIconFor(item), iconLabel: item.source });
  const trendTags = formatHighlightTags([
    importanceTagFor("main_items", item),
    ...trendTagsFor(context.trendAnnotations, "main_items", context.originalIndex)
  ].filter(Boolean));
  const evidence = formatInlineEvidenceAssets(context.report, evidenceForUrl(context.evidenceByUrl, item.url));
  return `${context.displayIndex}. **${title}**${trendTags}（${item.event_date}，${item.tier}）\n${bullets}${evidence ? `\n\n${evidence}` : ""}`;
}

function mainItemContractGroups(items) {
  const groups = [
    {
      title: "AI 资讯",
      categories: new Set(["ai_industry", "model_release", "headline"])
    },
    {
      title: "大厂与政策",
      categories: new Set(["company_business", "policy_infra", "funding"])
    },
    {
      title: "产品与开源",
      categories: new Set(["engineering_toolchain", "product_radar", "open_source"])
    },
    {
      title: "AIGC 动态",
      categories: new Set(["content_aigc"])
    }
  ].map((group) => ({ ...group, entries: [] }));
  const fallback = {
    title: "其他信号",
    categories: new Set(),
    entries: []
  };

  items.forEach((item, originalIndex) => {
    const category = String(item?.editorial_category || "").trim();
    const group = groups.find((entry) => entry.categories.has(category)) || fallback;
    group.entries.push({ item, originalIndex });
  });

  return [...groups, fallback].filter((group) => group.entries.length > 0);
}

function formatGithubTrending(items, context = {}) {
  const projects = Array.isArray(context.projects) ? context.projects : [];
  if (items.length === 0 && projects.length === 0) {
    return "";
  }

  const projectIndex = indexProjects(projects);
  const trendingLines = items
    .slice(0, 10)
    .map((item, index) => {
      const project = projectForTrend(item, projectIndex);
      const tag = githubTrendStatusHighlightTag(item);
      const tagText = formatHighlightTags([
        importanceTagFor("github_trending", item),
        tag,
        githubStarsTag(item),
        ...(project ? projectHeatTags(project) : []),
        project ? "项目 highlight" : "",
        ...trendTagsFor(context.trendAnnotations, "github_trending", index)
      ].filter(Boolean));
      const details = githubTrendDetails(item, project).join("；");
      return `${item.rank}. **${markdownLink(item.url, item.name || item.repo)}**${tagText}${details ? `: ${details}` : ""}`;
    })
    .join("\n");
  return trendingLines;
}

function githubTrendDetails(item, project) {
  const bullets = [];
  const description = trimText(cleanGithubTrendDescription(item), 120);
  if (description) {
    bullets.push(description);
  }

  const projectDetail = projectHighlightDetail(project, description);
  if (projectDetail) {
    bullets.push(projectDetail);
  }

  const rankMove = githubRankMove(item);
  if (rankMove) {
    bullets.push(rankMove);
  }

  return [...new Set(bullets.map((bullet) => trimText(bullet, 130)).filter(Boolean))].slice(0, 4);
}

function githubRankMove(item) {
  const rank = Number.isFinite(Number(item.rank)) ? `#${item.rank}` : "";
  const previousRank = Number.isFinite(Number(item.previous_rank)) ? Number(item.previous_rank) : null;
  const rankDelta = Number.isFinite(Number(item.rank_delta)) ? Number(item.rank_delta) : null;
  if (previousRank === null || rankDelta === null) {
    return rank ? `${rank}，近 7 天首次进入观察窗口` : "";
  }
  if (rankDelta > 0) {
    return `${rank}，较前一日上升 ${rankDelta} 位`;
  }
  if (rankDelta < 0) {
    return `${rank}，较前一日下降 ${Math.abs(rankDelta)} 位`;
  }
  return `${rank}，较前一日持平`;
}

function githubTrendVelocity(item) {
  const evidence = String(item.evidence || "");
  const match = evidence.match(/with\s+([0-9,]+)\s+stars today/i);
  return match ? `今日 +${match[1]} stars` : "";
}

function githubStarsTag(item) {
  return githubTrendVelocity(item);
}

function indexProjects(projects) {
  const byUrl = new Map();
  const byRepo = new Map();
  for (const project of projects) {
    const urlKey = normalizeEvidenceUrl(project?.url);
    if (urlKey) {
      byUrl.set(urlKey, project);
    }
    const repoKey = repoKeyFromProject(project);
    if (repoKey) {
      byRepo.set(repoKey, project);
    }
  }
  return { byUrl, byRepo };
}

function projectForTrend(item, projectIndex) {
  const urlKey = normalizeEvidenceUrl(item?.url);
  if (urlKey && projectIndex.byUrl.has(urlKey)) {
    return projectIndex.byUrl.get(urlKey);
  }
  const repoKey = repoKeyFromTrend(item);
  return repoKey ? projectIndex.byRepo.get(repoKey) : null;
}

function repoKeyFromTrend(item) {
  return normalizeRepoKey(item?.repo || item?.name || repoFromUrl(item?.url));
}

function repoKeyFromProject(project) {
  return normalizeRepoKey(project?.repo || project?.name || repoFromUrl(project?.url));
}

function repoFromUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!parsed.hostname.toLowerCase().includes("github.com")) {
      return "";
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
  } catch {
    return "";
  }
}

function normalizeRepoKey(value) {
  return String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").toLowerCase();
}

function projectHighlightDetail(project, baseDescription = "") {
  if (!project) {
    return "";
  }
  const hasBaseDescription = Boolean(String(baseDescription || "").trim());
  const projectDescription = cleanProjectDescription(project.description);
  const description = hasBaseDescription || isNearDuplicateText(projectDescription, baseDescription) ? "" : projectDescription;
  const hasDomains = Array.isArray(project.domains) && project.domains.length > 0;
  const domains = hasDomains
    ? `领域：${project.domains.join("、")}`
    : "";
  const useCaseText = String(project.use_case || "").trim();
  const useCase = useCaseText && !(hasBaseDescription && hasDomains) && !isNearDuplicateText(useCaseText, [baseDescription, description].filter(Boolean).join(" "))
    ? `适合：${useCaseText}`
    : "";
  return uniqueTextFragments([description, domains, useCase]).join(" ");
}

function uniqueTextFragments(fragments) {
  const result = [];
  for (const fragment of fragments.map((item) => String(item || "").trim()).filter(Boolean)) {
    if (!result.some((existing) => isNearDuplicateText(fragment, existing))) {
      result.push(fragment);
    }
  }
  return result;
}

function isNearDuplicateText(left, right) {
  const leftTokens = semanticTokens(left);
  const rightTokens = semanticTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const leftText = normalizeSemanticText(left);
  const rightText = normalizeSemanticText(right);
  if (leftText.length >= 16 && rightText.length >= 16 && (leftText.includes(rightText) || rightText.includes(leftText))) {
    return true;
  }

  const rightSet = new Set(rightTokens);
  const shared = new Set(leftTokens.filter((token) => rightSet.has(token))).size;
  const smaller = Math.min(new Set(leftTokens).size, rightSet.size);
  return smaller >= 4 && shared / smaller >= 0.45;
}

function semanticTokens(value) {
  const text = normalizeSemanticText(value);
  if (!text) {
    return [];
  }
  const tokens = text.match(/[a-z0-9][a-z0-9+#._-]*/g) || [];
  const cjk = text.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < cjk.length - 1; index += 1) {
    tokens.push(cjk.slice(index, index + 2));
  }
  return [...new Set(tokens.filter((token) => token.length > 1))];
}

function normalizeSemanticText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}+#._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatProjects(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => {
      const domains = Array.isArray(item.domains) && item.domains.length > 0 ? `\n  - 领域：${item.domains.join("、")}` : "";
      const useCase = item.use_case ? `\n  - 作用：${item.use_case}` : "";
      return `- **${markdownLink(item.url, item.name)}**${formatHighlightTags([importanceTag(item), ...projectHeatTags(item)].filter(Boolean))}：${cleanProjectDescription(item.description)}${domains}${useCase}`;
    })
    .join("\n");
}

function formatProjectCards(items) {
  return items.map((item) => {
    const domains = Array.isArray(item.domains) ? item.domains.filter(Boolean) : [];
    const points = editorialCardPoints(item);
    if (domains.length > 0) {
      points.push({ label: "领域", value: domains.join("、") });
    }
    if (item.use_case) {
      points.push({ label: "作用", value: item.use_case });
    }

    return {
      group: domains[0] || "PROJECTS",
      title: item.name,
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.name),
      body: cleanProjectDescription(item.description),
      tags: [importanceTagFor("projects", item), ...projectHeatTags(item)].filter(Boolean),
      points
    };
  });
}

function formatHotBlogCards(items, context = {}) {
  return items.map((item) => {
    const media = formatCardMedia(context.report, evidenceForUrl(context.evidenceByUrl, item.url));
    const points = hotBlogPointTexts(item.summary);
    const body = points.shift() || String(item.summary || "").trim();
    return {
      group: item.topic || item.publisher || "BLOG",
      title: item.title,
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.publisher || item.title),
      body,
      showGroup: false,
      tags: [cardTag(importanceTagFor("hot_blogs", item)), ...hotBlogTags(item).map((tag) => cardTag(tag, "topic"))].filter(Boolean),
      points: [
        ...points.map((value, index) => ({ label: `要点 ${index + 2}`, value })),
        ...editorialCardPoints(item)
      ],
      ...(media.length > 0 ? { media } : {})
    };
  });
}

function formatBuilderObservationCards(items, report) {
  return items.map((item) => {
    const originalText = builderOriginalText(item);
    const translation = builderTranslationText(item);
    const handle = builderHandle(item);
    const points = [];
    if (originalText) {
      points.push({ label: "原文", value: originalText });
    }
    if (handle) {
      points.push({ label: "账号", value: `@${handle}` });
    }

    return {
      group: "X/Twitter",
      title: item.author,
      href: item.url,
      titleIcon: builderAvatarIcon(report, item),
      body: formatDailyInlineText(translation, item),
      showGroup: false,
      tags: [
        cardTag(importanceTagFor("builder_observations", item)),
        item.role ? cardTag(item.role, "topic") : "",
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points
    };
  });
}

function builderOriginalText(item) {
  return String(item?.original_text || item?.originalText || item?.raw_text || "").trim();
}

function builderTranslationText(item) {
  return String(item?.translation || item?.translated_text || item?.content || "").trim();
}

function builderHandle(item) {
  const handle = String(item?.handle || "").trim().replace(/^@/, "");
  if (handle) {
    return handle;
  }
  try {
    const [, parsedHandle] = new URL(String(item?.url || "")).pathname.match(/^\/([^/]+)\/status\/\d+/i) || [];
    return String(parsedHandle || "").trim().replace(/^@/, "");
  } catch {
    return "";
  }
}

function builderAvatarIcon(report, item) {
  if (item?.avatar_data_uri) {
    return item.avatar_data_uri;
  }
  if (item?.avatar_local_path && report?.html_path) {
    return relativeAssetHref(report.html_path, item.avatar_local_path);
  }
  return generatedSiteIcon(siteInitials(item?.author || builderHandle(item) || "Builder"), "#111827", "#ffffff");
}

function hotBlogPointTexts(summary) {
  const text = String(summary || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return [];
  }
  const parts = text
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 4) : [text];
}

function editorialBullets(item) {
  return [
    item?.reader_relevance ? item.reader_relevance : "",
    hasNonPrimarySourceSignal(item) && item?.verification_note ? `核验：${item.verification_note}` : "",
    hasNonPrimarySourceSignal(item) && item?.risk_note ? `风险：${item.risk_note}` : ""
  ].filter(Boolean);
}

function editorialCardPoints(item) {
  const points = [];
  if (item?.reader_relevance) {
    points.push({ label: "看点", value: item.reader_relevance });
  }
  if (item?.watch_next) {
    points.push({ label: "继续看", value: item.watch_next });
  }
  if (hasNonPrimarySourceSignal(item)) {
    if (item?.source_level) {
      points.push({ label: "来源层级", value: sourceLevelLabel(item.source_level) });
    }
    if (item?.verification_note) {
      points.push({ label: "核验", value: item.verification_note });
    }
    if (item?.risk_note) {
      points.push({ label: "风险", value: item.risk_note });
    }
  }
  return points;
}

function hasNonPrimarySourceSignal(item = {}) {
  const sourceLevel = String(item?.source_level || "").trim();
  const status = String(item?.verification_status || "").trim();
  return Boolean(
    ["intermediary_only", "original_social_only", "unverified"].includes(status) ||
    (sourceLevel && !["primary", "official", "paper", "github", "multi_source"].includes(sourceLevel))
  );
}

function sourceLevelLabel(value) {
  const labels = {
    primary: "一手来源",
    official: "官方来源",
    paper: "论文/研究来源",
    github: "GitHub/仓库来源",
    multi_source: "多源确认",
    intermediary: "中介/媒体线索",
    community: "社区线索",
    original_social: "原始社交动态",
    unverified: "未核验线索",
    wechat_primary_like: "白名单公众号/近一手",
    wechat_industry_whitelist: "白名单公众号/行业线索",
    weekly_paper_aggregator: "论文周报聚合",
    open_source_aggregator: "开源聚合",
    tech_weekly_aggregator: "技术周报聚合",
    paper_api: "论文 API",
    community_api: "社区 API",
    paper_aggregator: "论文聚合",
    ai_news_aggregator: "AI 新闻聚合",
    aigc_content_industry: "AIGC 内容产业线索",
    ai_funding_product_radar: "融资/产品雷达线索"
  };
  return labels[value] || String(value || "").trim();
}

function formatCardMedia(report, assets) {
  if (!report || !Array.isArray(assets) || assets.length === 0) {
    return [];
  }

  return assets
    .filter((asset) => asset?.local_path)
    .slice(0, 2)
    .map((asset) => ({
      src: relativeAssetHref(report.html_path, asset.local_path),
      alt: asset.title || "",
      caption: evidenceCaption(asset)
    }));
}

function hotBlogTags(item) {
  const topic = String(item.topic || "").trim();
  if (!topic) {
    return [];
  }
  return [...new Set(topic.split(/[、,，/|]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function mainItemIconFor(item) {
  return item.source_icon || item.source_icon_data_uri || sourceIconForName(item.source) || siteIconForUrl(item.url, item.source);
}

function mainItemTitle(item) {
  const source = String(item.source || "").trim();
  const title = String(item.title || "").trim();
  return stripSourcePrefix(title, source);
}

function stripSourcePrefix(title, source) {
  const text = String(title || "").trim();
  const sourceText = String(source || "").trim();
  if (!sourceText) {
    return text;
  }
  const escapedSource = escapeRegex(sourceText);
  return text
    .replace(new RegExp(`^${escapedSource}\\s*[：:｜|\\-—–]?\\s*`, "i"), "")
    .trim() || text;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatHighlightTags(tags) {
  const markers = [];
  const seen = new Set();
  for (const tag of tags) {
    const marker = highlightTagMarker(tag);
    if (!marker || seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    markers.push(marker);
  }
  return markers.length > 0 ? ` ${markers.map((marker) => `==${marker}==`).join(" ")}` : "";
}

function highlightTagMarker(tag) {
  const text = String(tag || "").trim();
  if (!text) {
    return "";
  }
  if (/^trend-(?:new|up|down|same)\|/.test(text) || /^tag-[a-z0-9-]+\|/.test(text)) {
    return text;
  }
  const importance = importanceClassFromLabel(text);
  if (importance) {
    return `tag-${importance}|${text}`;
  }
  if (/stars?/i.test(text)) {
    return `tag-stars|${text}`;
  }
  if (/highlight|高亮|项目/.test(text)) {
    return `tag-highlight|${text}`;
  }
  return `tag-topic|${text}`;
}

function cardTag(label, forcedKind = "") {
  const text = String(label || "").trim();
  if (!text) {
    return "";
  }
  const kind = forcedKind || importanceClassFromLabel(text) || (/stars?/i.test(text) ? "stars" : "");
  return kind ? `${kind}|${text}` : text;
}

function importanceClassFromLabel(label) {
  const text = String(label || "").trim();
  if (text === "重大") return "major";
  if (text === "值得关注") return "notable";
  if (text === "一般") return "general";
  return "";
}

function importanceTagFor(sectionName, item) {
  return importanceTag(item) || importanceLabel(defaultImportanceForSection(sectionName, item));
}

function formatDailyInlineText(value, item = {}) {
  const kind = normalizeImportance(item.importance) || "notable";
  return String(value || "").replace(/==([^=\n]+)==/g, (_match, text) => {
    const inner = String(text || "").trim();
    if (/^(?:keyword|tag|trend)-/.test(inner)) {
      return `==${inner}==`;
    }
    return `==keyword-${kind}|${inner}==`;
  });
}

function formatTwitterDiscussion(items, auditGroup, options = {}) {
  if (items.length > 0) {
    const content = items
      .map((item) => {
        const details = formatNestedEditorialDetails(item);
        const line = `- **${item.author}**${formatHighlightTags([importanceTagFor("builder_observations", item)].filter(Boolean))}${item.role ? `（${item.role}）` : ""}：${formatDailyInlineText(item.content, item)} ${markdownLink(item.url, item.source || "X/Twitter")}`;
        return details ? `${line}\n${details}` : line;
      })
      .join("\n");
    return options.includeHeading ? `### X/Twitter 讨论\n\n${content}` : content;
  }

  if (!auditGroup?.checked) {
    return "";
  }

  const checkedSources = Array.isArray(auditGroup.sources)
    ? auditGroup.sources
        .map((source) => `${source.name || "未知来源"}:${source.status || "unknown"}${source.notes ? `（${source.notes}）` : ""}`)
        .join("；")
    : "未记录具体来源";
  const reason = auditGroup.blocked_reason || auditGroup.notes || "未入选近期原始 X/Twitter status。";
  const content = `- **降级说明**：本轮已检查 X/Twitter 相关来源，但未形成可入选的原始 status 条目。原因：${reason}\n- **检查来源**：${checkedSources}`;
  return options.includeHeading ? `### X/Twitter 讨论\n\n${content}` : content;
}

function formatCommunityLeads(items, options = {}) {
  const leads = items.filter((item) => !isLowSignalStatuspageLead(item));
  if (leads.length === 0) {
    return "";
  }

  const content = leads.map((item) => {
    const details = formatNestedEditorialDetails(item);
    const line = `- ${formatHighlightTags([importanceTagFor("community_leads", item)].filter(Boolean))}${formatDailyInlineText(item.content, item)} ${markdownLink(item.url, "来源")}`;
    return details ? `${line}\n${details}` : line;
  }).join("\n");
  return options.includeHeading ? `### 社区线索\n\n${content}` : content;
}

function formatNestedEditorialDetails(item) {
  return editorialBullets(item)
    .map((bullet) => `  - ${bullet}`)
    .join("\n");
}

function signalSectionTitle(builderSection, communitySection) {
  if (builderSection && communitySection) {
    return "X/Twitter 讨论与社区线索";
  }
  return builderSection ? "X/Twitter 讨论" : "社区线索";
}

function isLowSignalStatuspageLead(item) {
  const content = String(item?.content || "").toLowerCase();
  const url = String(item?.url || "");
  if (!isStatuspageUrl(url)) {
    return false;
  }

  return /elevated errors|resolved|troubleshooting|incident|degraded|outage|error rate|\berrors\b|排障|故障|已恢复|已解决|标记 resolved/i.test(content);
}

function isDomesticCommunityLead(item) {
  const text = [
    item?.source,
    item?.publisher,
    item?.content,
    item?.title,
    ...(Array.isArray(item?.entities) ? item.entities : [])
  ].filter(Boolean).join(" ");
  return /36Kr|QbitAI|Jiqizhixin|Leiphone|InfoQ CN|机器之心|量子位|雷峰|阿里|Alibaba|Qwen|千问|通义|腾讯|Tencent|字节|ByteDance|火山引擎|Volcano|豆包|Doubao|百度|Baidu|MiniMax|Moonshot|Kimi|DeepSeek|智谱|Zhipu|商汤|SenseTime|昆仑|Kunlun|星尘|Astribot|跨维|中国|国内|东方航空|瑞幸|肯德基|蜜雪冰城/i.test(text);
}

function isStatuspageUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.startsWith("status.") || hostname.includes("statuspage");
  } catch {
    return false;
  }
}

function evidenceAssetsBySourceUrl(assets) {
  const grouped = new Map();
  for (const asset of assets) {
    const key = normalizeEvidenceUrl(asset?.source_url);
    if (!key || !hasRenderableEvidence(asset)) {
      continue;
    }
    const current = grouped.get(key) || [];
    if (!current.some((existing) => evidenceAssetIdentity(existing) === evidenceAssetIdentity(asset))) {
      current.push(asset);
    }
    grouped.set(key, current);
  }
  return grouped;
}

function evidenceAssetIdentity(asset) {
  return asset?.local_path || `${asset?.title || ""}:${JSON.stringify(asset?.data || [])}`;
}

function evidenceForUrl(evidenceByUrl, url) {
  if (!evidenceByUrl || typeof evidenceByUrl.get !== "function") {
    return [];
  }
  return evidenceByUrl.get(normalizeEvidenceUrl(url)) || [];
}

function normalizeEvidenceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function hasRenderableEvidence(asset) {
  return Boolean(asset && (asset.local_path || (Array.isArray(asset.data) && asset.data.length > 0)));
}

function formatInlineEvidenceAssets(report, assets) {
  if (!report || !Array.isArray(assets) || assets.length === 0) {
    return "";
  }

  const renderableAssets = assets.slice(0, 2);
  if (renderableAssets.length === 2 && renderableAssets.every((asset) => asset?.local_path)) {
    const imageLine = renderableAssets
      .map((asset) => markdownImage(relativeAssetHref(report.html_path, asset.local_path), asset.title))
      .filter(Boolean)
      .join(" ");
    const captionLine = renderableAssets
      .map((asset, index) => `${index + 1}. ${evidenceCaption(asset)}`)
      .join(" / ");
    return [imageLine, `*${captionLine}*`].filter(Boolean).join("\n\n");
  }

  return renderableAssets
    .map((asset) => formatInlineEvidenceAsset(report, asset))
    .filter(Boolean)
    .join("\n\n");
}

function formatInlineEvidenceAsset(report, asset) {
  const caption = evidenceCaption(asset);
  if (asset.local_path) {
    return [
      markdownImage(relativeAssetHref(report.html_path, asset.local_path), asset.title),
      `*${caption}*`
    ].join("\n\n");
  }
  const table = formatEvidenceTable(asset.data);
  if (table) {
    return [table, `*${caption}*`].join("\n\n");
  }
  return "";
}

function evidenceCaption(asset) {
  const title = String(asset.title || "").trim();
  const caption = String(asset.caption || "").trim();
  if (!caption || caption === title) {
    return title;
  }
  return title ? `${title}：${caption}` : caption;
}

function formatEvidenceTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) {
    return "";
  }

  const header = rows[0].map((cell) => escapeMarkdownTableCell(cell));
  const body = rows.slice(1).filter(Array.isArray);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map((cell) => escapeMarkdownTableCell(cell)).join(" | ")} |`)
  ].join("\n");
}

function formatSourceAudit(audit) {
  if (!audit) {
    return "未记录信源审计。";
  }

  return [
    formatAuditGroup("GitHub Trending", audit.github_trending),
    formatAuditGroup("Builder 原始源", audit.builder_sources),
    audit.content_sources ? formatAuditGroup("热门博客与访谈源", audit.content_sources) : "",
    audit.search_sources ? formatAuditGroup("搜索 / 新闻影子源", audit.search_sources) : "",
    audit.sources_health ? formatAuditGroup("信源健康检查", audit.sources_health) : ""
  ].filter(Boolean).join("\n\n");
}

function formatAuditGroup(title, group) {
  if (!group) {
    return `### ${title}\n\n未记录。`;
  }

  const counts = sourceStatusCounts(group.sources);
  const sources = Array.isArray(group.sources) && group.sources.length > 0
    ? group.sources.map((source) => `- ${markdownLink(source.url, source.name)}：${source.status}${source.notes ? `，${source.notes}` : ""}`).join("\n")
    : "- 未记录具体来源。";
  const details = [
    `- Source status: checked=${counts.checked}; no_signal=${counts.no_signal}; blocked=${counts.blocked}; skipped=${counts.skipped}`,
    `- 检查状态：${group.checked ? "已检查" : "未检查"}`,
    `- 候选 / 入选：${group.candidates_found} / ${group.included}`,
    group.blocked_reason ? `- 阻塞原因：${group.blocked_reason}` : "",
    group.last_successful_feed_at ? `- 上次成功获取：${group.last_successful_feed_at}` : "",
    `- 说明：${group.notes || "无"}`
  ].filter(Boolean);
  return `### ${title}\n\n${details.join("\n")}\n\n${sources}`;
}

function sourceStatusCounts(sources) {
  const counts = { checked: 0, no_signal: 0, blocked: 0, skipped: 0 };
  for (const source of Array.isArray(sources) ? sources : []) {
    const status = String(source?.status || "");
    if (status === "checked") counts.checked += 1;
    else if (status === "no_signal") counts.no_signal += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status.startsWith("skipped")) counts.skipped += 1;
  }
  return counts;
}

function formatSelfCheck(selfCheck) {
  if (!selfCheck) {
    return "未记录自检。";
  }

  const suggestions = Array.isArray(selfCheck.optimization_suggestions) && selfCheck.optimization_suggestions.length > 0
    ? selfCheck.optimization_suggestions
        .map(formatOptimizationSuggestion)
        .join("\n")
    : "- 本轮无新增建议。";
  return `- 主线条目：${selfCheck.main_items}\n- Builder 观察：${selfCheck.builder_observations}\n- 一手链接：${selfCheck.primary_links ? "通过" : "未通过"}\n- 无禁用表达：${selfCheck.no_banned_words ? "通过" : "未通过"}\n- 无无源数字：${selfCheck.no_unsourced_numbers ? "通过" : "未通过"}\n- 说明：${selfCheck.notes || "无"}\n\n### 提示词与规则迭代建议\n\n${suggestions}`;
}

function formatOptimizationSuggestion(item) {
  const title = item.issue || item.observed_issue || item.suggestion || "建议";
  const change = item.suggestion || item.proposed_change || "";
  const details = [
    stripTrailingSentencePunctuation(change),
    item.expected_benefit ? `为什么要改：${item.expected_benefit}` : ""
  ].filter(Boolean);
  return details.length > 0 ? `- **${title}**：${details.join("；")}` : `- **${title}**`;
}

function stripTrailingSentencePunctuation(value) {
  return String(value || "").trim().replace(/[。；;.\s]+$/u, "");
}

function markdownLink(url, label, options = {}) {
  const icon = options.icon === false ? "" : options.icon || siteIconForUrl(url, label);
  const iconMarkdown = icon ? `${markdownImage(icon, options.iconLabel || label)} ` : "";
  return `${iconMarkdown}[${escapeMarkdownText(label || url)}](${String(url)})`;
}

function markdownImage(url, label) {
  if (!url) {
    return "";
  }
  return `![${escapeMarkdownText(label || "")}](${String(url)})`;
}

function escapeMarkdownText(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function sourceIconForName(name) {
  return SOURCE_ICONS.get(String(name || "").trim()) || "";
}

function siteIconForUrl(url, label = "") {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return DOMAIN_ICONS.get(host) || generatedSiteIcon(siteInitials(label || host), siteColor(host), "#ffffff");
  } catch {
    return "";
  }
}

function siteInitials(value) {
  const text = String(value || "").trim();
  const domain = text.includes(".") ? text.split(".").filter(Boolean).slice(0, 2).join(" ") : text;
  const letters = domain
    .replace(/https?:\/\//i, "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (letters || "?").slice(0, 3);
}

function siteColor(host) {
  const colors = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#b45309", "#374151", "#047857"];
  const text = String(host || "");
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return colors[hash % colors.length];
}

function generatedSiteIcon(label, background, foreground) {
  const text = escapeSvgText(String(label || "?").slice(0, 3).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${background}"/><text x="16" y="21" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${text.length > 2 ? 10 : 13}" font-weight="700" fill="${foreground}">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeMarkdownTableCell(value) {
  return escapeMarkdownText(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
